# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError, UserError
from dateutil import relativedelta
from datetime import datetime, date, timedelta
from odoo.http import request
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT
import pytz
import logging
import locale

_logger = logging.getLogger(__name__)


class ReportPosWizard(models.TransientModel):
    _name = 'credit.report_pos_wizard'
    _description = 'Wizard para el reporte de las ventas en POS '


    start_date = fields.Datetime(string='Fecha y Hora inicial')
    end_date = fields.Datetime(string='Fecha y Hora Final')
    end_date_copy = fields.Datetime(string='Fecha y Hora Final')
    company_id = fields.Many2one('res.company', string='Compañia',)
    partner_id = fields.Many2one('res.partner', string='Cliente',)
    check_mail = fields.Boolean(string='Enviar por Correo',)
    check_format_date = fields.Boolean(string="Reporte Diario", default=False)
    email_to = fields.Many2many('res.partner', string='Destinatarios')

    @api.multi
    @api.onchange('partner_id')
    def _default_date_report(self):
        contracts = self.env['contract.contract'].search([('partner_id', '=', self.partner_id.id), ('active', '=', True)])
        if not contracts:
            contracts = self.env['contract.contract'].search(
                [('partner_id', '=', self.partner_id.parent_id.id), ('active', '=', True)])

        for c in contracts:
            for lc in c.contract_line_ids:
                if lc.next_period_date_start and lc.next_period_date_end:
                    start_date = datetime(year=lc.next_period_date_start.year, month=lc.next_period_date_start.month,
                                          day=lc.next_period_date_start.day, hour=0, minute=0, second=0)
                    end_date = datetime(year=lc.next_period_date_end.year, month=lc.next_period_date_end.month,
                                        day=lc.next_period_date_end.day, hour=23, minute=59, second=59)
                    time_zone = self._context.get('tz')
                    if not time_zone:
                        time_zone = 'Mexico/General'
                    tz = pytz.timezone(time_zone)
                    start_date = tz.localize(start_date).astimezone(pytz.utc)
                    end_date = tz.localize(end_date).astimezone(pytz.utc)
                    self.start_date = datetime.strftime(start_date, "%Y-%m-%d %H:%M:%S")
                    self.end_date = datetime.strftime(end_date, "%Y-%m-%d %H:%M:%S")

    @api.onchange('check_format_date', 'start_date', 'end_date')
    def _onchange_check(self):
        if self.check_format_date:
            if self.start_date and self.end_date:
                start_date = datetime(year=self.start_date.year, month=self.start_date.month, day=self.start_date.day,
                                           hour=0, minute=0, second=0)
                end_date = datetime(year=self.start_date.year, month=self.start_date.month, day=self.start_date.day,
                                         hour=23, minute=59, second=59)
                time_zone = self._context.get('tz')
                if not time_zone:
                    time_zone = 'Mexico/General'
                tz = pytz.timezone(time_zone)
                start_date = tz.localize(start_date).astimezone(pytz.utc)
                end_date = tz.localize(end_date).astimezone(pytz.utc)
                self.start_date = datetime.strftime(start_date, "%Y-%m-%d %H:%M:%S")
                self.end_date = datetime.strftime(end_date, "%Y-%m-%d %H:%M:%S")

    @api.multi
    def consult_credit_details(self):
        time_zone = self._context.get('tz')
        if not time_zone:
            time_zone = 'Mexico/General'
        tz = pytz.timezone(time_zone)
        start_date = fields.Datetime.from_string(self.start_date)
        start_date = pytz.utc.localize(start_date).astimezone(tz)
        end_date = fields.Datetime.from_string(self.end_date)
        end_date = pytz.utc.localize(end_date).astimezone(tz)

        partner_ids = self.partner_id.child_ids.mapped('id')
        partner_ids.append(self.partner_id.id)
        orders = self.env['pos.order'].search([('company_id', '=', self.company_id.id),
                                               ('partner_id', 'in', partner_ids),
                                               ('credit_amount', '>', 0),
                                               ('date_order', '>=', start_date), ('date_order', '<=', end_date)])
        importes_por_persona = dict()
        res = []
        sum = 0
        if orders:
            for o in orders:
                if o.partner_id in importes_por_persona:
                    importes_por_persona[o.partner_id] += o.amount_total
                else:
                    importes_por_persona[o.partner_id] = o.amount_total
            for key, value in importes_por_persona.items():
                res.append({
                    'client_number': key.client_number,
                    'cliente_principal': key.parent_id.name,
                    'cliente': key.name,
                    'importe': value,
                    })
                sum += value
            return res, sum
        else:
            raise ValidationError("No Tiene Información para Mostrar ")

    @api.multi
    def get_report_credit_details(self):
        action = self.get_details()
        if self.check_mail:
            self.send_mail_report(action)
        return action

    @api.multi
    def get_details(self):
        res, sum = self.consult_credit_details()

        tz = pytz.timezone(self._context.get('tz'))
        start_date = fields.Datetime.from_string(self.start_date)
        start_date = pytz.utc.localize(start_date).astimezone(tz)
        end_date = fields.Datetime.from_string(self.end_date)
        end_date = pytz.utc.localize(end_date).astimezone(tz)
        diff = end_date - start_date
        data = {
            'orders': res,
            'total': sum,
            'start_date': start_date,
            'end_date': end_date,
            'cut_date': datetime.strftime(end_date, '%d-%b-%Y'),
            'client': self.partner_id,
            'days': diff.days + (1 if diff.seconds else 0),
        }
        return self.env.ref('credit.action_report_credit_summary').report_action(self, data=data, config=False)

    @api.multi
    def sale_report_pos(self):
        tz = pytz.timezone(self._context.get('tz'))
        start_date = fields.Datetime.from_string(self.start_date)
        start_date = pytz.utc.localize(start_date).astimezone(tz)
        end_date = fields.Datetime.from_string(self.end_date)
        end_date = pytz.utc.localize(end_date).astimezone(tz)
        view_id = self.env.ref('point_of_sale.view_pos_order_tree').id
        domain = [('date_order', '>=', start_date), ('date_order', '<=', end_date)]
        return {
            'type': 'ir.actions.act_window',
            'name': 'Ventas de los Clientes',
            'res_model': 'pos.order',
            'view_type': 'form',
            'view_mode': 'form',
            'views': [(view_id, 'tree')],
            'domain': domain,
        }

    @api.multi
    def send_mail_report(self, action):
        data_context = {
            'context': action['context'],
            'orders': action['data']['orders'],
            'total': action['data']['total'],
            'start_date': datetime.strftime(action['data']['start_date'], '%Y-%m-%d %H:%M:%S'),
            'end_date': datetime.strftime(action['data']['end_date'], '%Y-%m-%d %H:%M:%S'),
            'cut_date': action['data']['cut_date'],
            'days': action['data']['days'],
        }
        email_send = self.with_context(data_context)
        template = email_send.env.ref('credit.email_template_reporte_credito')
        email_send.send(template) # enviar


    def send(self, template):
        # objeto odoo de correo
        if not self.email_to:
            raise ValidationError("Especifique destinatarios de correo")
        mail_server = self.env['ir.mail_server'].sudo().search([], limit=1, order='sequence')
        if not mail_server:
            raise ValidationError("Configure un servidor de correo saliente")
        email_to = ""
        for partner in self.email_to:
            email_to += partner.email
            email_to += ','
        email_to = email_to[:-1]
        mail_data = template
        mail_data.update({
            'email_to': email_to,
            'email_from': mail_server.smtp_user,
            'mail_server_id': mail_server.id,
        })
        try:
            mail_data.sudo().send_mail(self.id, raise_exception=True, force_send=True)
        except Exception as e:
            raise UserError(e)
        _logger.info("Reporte de Pos Enviado📬")