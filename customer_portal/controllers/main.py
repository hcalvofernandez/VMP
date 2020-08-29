# -*- coding: utf-8 -*-

from odoo.tools.translate import _
import werkzeug.utils
from odoo.exceptions import ValidationError, AccessError, MissingError, UserError
from odoo import http, fields
from odoo.http import request, content_disposition
import logging
import uuid
from datetime import datetime, timedelta, date
import pytz
import re

try:
    from secrets import token_bytes
except ImportError:
    from os import urandom


    def token_bytes(nbytes=None):
        return urandom(nbytes)

_logger = logging.getLogger(__name__)


class Home(http.Controller):

    def is_authenticated(self):
        session_obj = request.env['customer_portal.session'].sudo()
        customer_portal_session_id = request.httprequest.cookies.get('customer_portal_session_id')
        session = session_obj.search(
            [('session_token', '=', customer_portal_session_id), ('odoo_session_token', '=', request.session.sid)])
        if session:
            return session
        else:
            return False

    @http.route('/customer/portal/login', type='http', auth="none", sitemap=False)
    def customer_portal_login(self, **kw):
        if request.httprequest.method == 'POST':
            session_obj = request.env['customer_portal.session'].sudo()
            if self.is_authenticated():
                return werkzeug.utils.redirect('/customer/portal', 303)
            else:
                data = request.httprequest.values
                client_number = data.get('login', False)
                client_pin = data.get('password', False)
                if client_number and client_pin:
                    partner_obj = request.env['res.partner'].sudo()
                    partner = partner_obj.search(
                        [('client_number', '=', client_number), ('client_pin', '=', client_pin)], limit=1)
                    if partner:
                        token = uuid.UUID(bytes=token_bytes(16)).hex
                        session_obj.create({
                            'partner_id': partner.id,
                            'session_token': token,
                            'odoo_session_token': request.session.sid
                        })
                        redirect = werkzeug.utils.redirect('/customer/portal', 303)
                        redirect.set_cookie('customer_portal_session_id', token)
                        return redirect

        response = request.render('customer_portal.login')
        response.headers['X-Frame-Options'] = 'DENY'
        return response

    @http.route('/customer/portal/logout', type='http', auth="none", sitemap=False)
    def customer_portal_logout(self, **kw):
        session = self.is_authenticated()
        if self.is_authenticated():
            session.unlink()

        redirect = werkzeug.utils.redirect('/customer/portal', 303)
        redirect.set_cookie('customer_portal_session_id', '', 0)
        return redirect

    @http.route('/customer/portal', type='http', auth="none", sitemap=False)
    def customer_portal(self, **kw):
        session = self.is_authenticated()
        if session:
            response = request.render('customer_portal.portal', self._prepare_portal_values(session.partner_id))
            response.headers['X-Frame-Options'] = 'DENY'
            return response
        else:
            return werkzeug.utils.redirect('/customer/portal/login', 303)

    @http.route('/customer/portal/account/status', type='http', auth="none", sitemap=False)
    def account_status_report(self, **kw):
        session = self.is_authenticated()
        if session:
            data = self._prepare_portal_values(session.partner_id)
            return self._show_report(session.partner_id, 'pdf', 'credit.action_report_credit_summary_individual', data, 'Reporte de Ventas Individual',True)
        else:
            return werkzeug.utils.redirect('/customer/portal', 303)

    @http.route('/customer/portal/account/status/send', type='json', auth="none", sitemap=False)
    def account_status_send_report(self, **kw):
        session = self.is_authenticated()
        if session and session.partner_id.email:
            wizard = request.env['credit.report_pos_individual_wizard'].sudo().create({'partner_id': session.partner_id.id, 'email_to': [(4, session.partner_id.id, False)]})
            data = self._prepare_portal_values(session.partner_id)
            wizard.send_mail_report({'data': data})
            return True
        else:
            return False

    @http.route('/customer/portal/change/pin', type='json', auth="none", sitemap=False)
    def customer_portal_change_pin(self, old_pin, new_pin, **kw):
        session = self.is_authenticated()
        if session:
            if session.partner_id.client_pin == old_pin:
                session.partner_id.write({'client_pin': new_pin})
                return True
            else:
                return False
        else:
            return False

    def _customer_sale_period(self, partner_id):
        result = {
            'start_date': False,
            'end_date': False
        }
        contracts = request.env['contract.contract'].sudo().search(
            [('partner_id', '=', partner_id.id), ('active', '=', True)])
        if not contracts:
            contracts = request.env['contract.contract'].sudo().search(
                [('partner_id', '=', partner_id.parent_id.id), ('active', '=', True)])

        for c in contracts:
            for lc in c.contract_line_ids:
                if lc.next_period_date_start and lc.next_period_date_end:
                    start_date = datetime(year=lc.next_period_date_start.year, month=lc.next_period_date_start.month,
                                          day=lc.next_period_date_start.day, hour=0, minute=0, second=0)
                    end_date = datetime(year=lc.next_period_date_end.year, month=lc.next_period_date_end.month,
                                        day=lc.next_period_date_end.day, hour=23, minute=59, second=59)

                    time_zone = request._context.get('tz')
                    if not time_zone:
                        time_zone = 'Mexico/General'
                    tz = pytz.timezone(time_zone)
                    start_date = tz.localize(start_date).astimezone(pytz.utc)
                    end_date = tz.localize(end_date).astimezone(pytz.utc)

                    result['start_date'] = datetime.strftime(start_date, "%Y-%m-%d %H:%M:%S")
                    result['end_date'] = datetime.strftime(end_date, "%Y-%m-%d %H:%M:%S")

        return result

    def _prepare_portal_values(self, partner_id):
        result = self._customer_sale_period(partner_id)
        start_date = result['start_date']
        end_date = result['end_date']
        if start_date and end_date:
            orders = []
            sum = 0
            orders_period = request.env['pos.order'].sudo().search([('partner_id.id', '=', partner_id.id),
                                                                    ('credit_amount', '>', 0),
                                                                    ('date_order', '>=', start_date),
                                                                    ('date_order', '<=', end_date)])
            for order in orders_period:
                orders.append({
                    'order': order.name,
                    'date': datetime.strftime(order.date_order, '%Y-%m-%d %H:%M:%S'),
                    'ticket': order.pos_reference,
                    'amount': order.credit_amount,
                })
                sum += order.credit_amount

            partner_ids = [partner_id.id, partner_id.parent_id.id]
            contract_id = request.env['contract.contract'].sudo().search([('partner_id', 'in', partner_ids),
                                                                          ('type_contract', '=', 'credito')])
            max_pay_date = ""
            if contract_id:
                contract = contract_id[0]
                if len(contract_id) > 1:
                    if contract_id[0].partner_id.id == partner_id:
                        contract = contract_id[0]
                    elif contract_id[1].partner_id.id == partner_id:
                        contract = contract_id[1]

                if contract.payment_term_id:
                    result = contract.payment_term_id.compute(5, end_date)
                    max_pay_date = date.strftime(datetime.strptime(result[0][0][0], '%Y-%m-%d'), '%d-%b-%Y')

            diff = datetime.strptime(end_date, '%Y-%m-%d %H:%M:%S') - datetime.strptime(start_date, '%Y-%m-%d %H:%M:%S')
            days = diff.days + (1 if diff.seconds else 0)
            time_zone = request._context.get('tz')
            if not time_zone:
                time_zone = 'Mexico/General'
            tz = pytz.timezone(time_zone)
            start_date_localized = pytz.utc.localize(datetime.strptime(start_date, '%Y-%m-%d %H:%M:%S')).astimezone(tz)
            end_date_localized = pytz.utc.localize(datetime.strptime(end_date, '%Y-%m-%d %H:%M:%S')).astimezone(tz)
            return {
                'orders': orders,
                'total': sum,
                'start_date_format': date.strftime(start_date_localized, '%d-%b-%Y'),
                'start_date': start_date,
                'end_date_format': date.strftime(end_date_localized, '%d-%b-%Y'),
                'end_date': end_date,
                'days': days,
                "partner": partner_id,
                "partner_id": partner_id.id,
                'cut_date': datetime.strftime(datetime.strptime(end_date, '%Y-%m-%d %H:%M:%S'), '%d-%b-%Y'),
            }
        else:
            return {
                'orders': [],
                'total': 0,
                'start_date_format': '',
                'start_date': '',
                'end_date_format': '',
                'end_date': '',
                'cut_date': '',
                'days': 0,
                "partner": partner_id,
                "partner_id": partner_id.id,
            }

    def _show_report(self, model, report_type, report_ref, data={}, file_name='document', download=False):
        if report_type not in ('html', 'pdf', 'text'):
            raise UserError(_("Invalid report type: %s") % report_type)

        report_sudo = request.env.ref(report_ref).sudo()

        if not isinstance(report_sudo, type(request.env['ir.actions.report'])):
            raise UserError(_("%s is not the reference of a report") % report_ref)

        data.update({'report_type': report_type})
        method_name = 'render_qweb_%s' % (report_type)
        report = getattr(report_sudo, method_name)([model.id], data=data)[0]
        reporthttpheaders = [
            ('Content-Type', 'application/pdf' if report_type == 'pdf' else 'text/html'),
            ('Content-Length', len(report)),
        ]
        if report_type == 'pdf' and download:
            filename = "%s.pdf" % (re.sub('\W+', '-', file_name))
            reporthttpheaders.append(('Content-Disposition', content_disposition(filename)))
        return request.make_response(report, headers=reporthttpheaders)