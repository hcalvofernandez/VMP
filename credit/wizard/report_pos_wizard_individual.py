# -*- coding:utf-8 -*-
import locale

from odoo import models, fields, api
from odoo.exceptions import ValidationError
from dateutil import relativedelta
from datetime import datetime, timedelta
import pytz
import logging

_logger = logging.getLogger(__name__)


class ReportPosIndividualWizard(models.TransientModel):
    _name = 'credit.report_pos_individual_wizard'
    _description = 'Wizard para el reporte de las ventas en POS Individual '

    start_date = fields.Datetime(string='Fecha y Hora inicial')
    end_date = fields.Datetime(string='Fecha y Hora Final')
    partner_id = fields.Many2one('res.partner', string='Cliente', )
    check_mail = fields.Boolean(string='Enviar por Correo', )
    check_format_date = fields.Boolean(string="Reporte Diario", default=False)
    email_to = fields.Many2many('res.partner', string='Destinatarios')

    @api.onchange('partner_id')
    def _default_date_report(self):
        contracts = self.env['contract.contract'].search(
            [('partner_id', '=', self.partner_id.id), ('active', '=', True)])
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

                    tz = pytz.timezone(self._context.get('tz'))
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

                tz = pytz.timezone(self._context.get('tz'))
                start_date = tz.localize(start_date).astimezone(pytz.utc)
                end_date = tz.localize(end_date).astimezone(pytz.utc)
                self.start_date = datetime.strftime(start_date, "%Y-%m-%d %H:%M:%S")
                self.end_date = datetime.strftime(end_date, "%Y-%m-%d %H:%M:%S")

    @api.multi
    def consult_report_individual_details(self):
        one = self.start_date
        two = self.end_date
        # start = one.strftime("%m-%d-%Y %H:%M:%S.%f")
        # end = two.strftime("%m-%d-%Y %H:%M:%S.%f")
        res = []
        sum = 0
        orders = self.env['pos.order'].search([('partner_id.id', '=', self.partner_id.id),
                                               ('credit_amount', '>', 0),
                                               ('date_order', '>=', one),
                                               ('date_order', '<=', two)])

        # for order in orders:
        #     credit_amount = order.credit_amount
        #     res_credit = credit_amount
        #     for line in order.lines:
        #         line_amount = line.price_subtotal_incl
        #         line_name = line.product_id.name
        #         if res_credit >= line_amount:
        #             res_credit -= line_amount
        #         else:
        #             line_amount = res_credit
        #             line_name += " (Complementario)"
        #         res.append({
        #             'orden': line.order_id.name,
        #             'fecha': line.create_date,
        #             'producto': line_name,
        #             'importe': line_amount,
        #             })
        #     sum += credit_amount

        for order in orders:
            res.append({
                'order': order.name,
                'date': order.date_order,
                'ticket': order.pos_reference,
                'amount': order.credit_amount,
            })
            sum += order.credit_amount
        return res, sum

    @api.multi
    def get_report_individual_details(self):
        action = self.get_details()
        if self.check_mail:
            self.send_mail_report(action)
        return action

    @api.multi
    def get_details(self):
        days = (self.end_date - self.start_date).days
        orders, total = self.consult_report_individual_details()
        try:
            locale.setlocale(locale.LC_TIME, 'es_ES.utf8')
        except:
            pass
        data = {
            'orders': orders,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'cut_date': datetime.strftime(self.end_date, '%d-%b-%Y'),
            'total': total,
            'days': days,
        }
        return self.env.ref('credit.action_report_credit_summary_individual').report_action(self, data=data,
                                                                                            config=False)

    @api.multi
    def send_mail_report(self, action):
        data_context = {
            'context': action['context'],
            'orders': action['data']['orders'],
            'total': action['data']['total'],
            'start_date': action['data']['start_date'],
            'end_date': action['data']['end_date'],
            'cut_date': action['data']['cut_date'],
            'days': action['data']['days'],
        }
        email_send = self.with_context(data_context)
        template = email_send.env.ref('credit.email_template_reporte_credito_individual')
        email_send.send(template)  # enviar

    def send(self, template):
        # objeto odoo de correo
        if not self.email_to:
            raise ValidationError("Especifique destinatarios de correo")
        mail_server = self.env['ir.mail_server'].search([], limit=1, order='sequence')
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
            mail_data.send_mail(self.id, raise_exception=True, force_send=True)
        except:
            raise ValidationError("No se pudieron enviar los correos")
        _logger.info("Reporte de Pos Enviado📬")
