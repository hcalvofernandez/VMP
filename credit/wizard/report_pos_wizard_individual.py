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


    start_date = fields.Datetime(string='Fecha y Hora inicial', required=True,)
    end_date = fields.Datetime(string='Fecha y Hora Final', required=True, )
    partner_id = fields.Many2one('res.partner', string='Cliente',)
    check_mail = fields.Boolean(string='Enviar por Correo',)
    check_format_date = fields.Boolean(string="Reporte Diario", default=True)

    @api.onchange('partner_id')
    def _default_date_report(self):
        contracts = self.env['contract.contract'].search(
            [('partner_id', '=', self.partner_id.id), ('active', '=', True)])
        if not contracts:
            contracts = self.env['contract.contract'].search(
                [('partner_id', '=', self.partner_id.parent_id.id), ('active', '=', True)])

        for c in contracts:
            for lc in c.contract_line_ids:
                start_date_utc = datetime(year=lc.next_period_date_start.year, month=lc.next_period_date_start.month,
                                          day=lc.next_period_date_start.day, hour=0, minute=0, second=0)
                end_date_utc = datetime(year=lc.next_period_date_end.year, month=lc.next_period_date_end.month,
                                        day=lc.next_period_date_end.day,
                                        hour=23, minute=59, second=59)
                # Temporal, luego mejorar
                tz = pytz.timezone(self.env.user.tz) if self.env.user.tz else pytz.utc
                if str(tz) == 'Mexico/General':
                    start_date_utc = start_date_utc + timedelta(hours=5)
                    end_date_utc = end_date_utc + timedelta(hours=5)
                self.start_date = start_date_utc
                self.end_date = end_date_utc

    @api.onchange('check_format_date')
    def _onchange_check(self):
        if self.check_format_date:
            self.start_date = datetime(year=self.start_date.year, month=self.start_date.month, day=self.start_date.day,
                                       hour=0, minute=0, second=0)
            self.end_date = datetime(year=self.start_date.year, month=self.start_date.month, day=self.start_date.day,
                                     hour=23, minute=59, second=59)
            # Temporal, luego mejorar
            tz = pytz.timezone(self.env.user.tz) if self.env.user.tz else pytz.utc
            if str(tz) == 'Mexico/General':
                self.start_date = self.start_date + timedelta(hours=5)
                self.end_date = self.end_date + timedelta(hours=5)


    @api.multi
    def consult_report_individual_details(self):
        one = self.start_date
        two = self.end_date
        # start = one.strftime("%m-%d-%Y %H:%M:%S.%f")
        # end = two.strftime("%m-%d-%Y %H:%M:%S.%f")
        res = []
        sum = 0
        orders = self.env['pos.order.line'].search([('order_id.partner_id.id', '=', self.partner_id.id),
                                                    ('order_id.state_order_fac', '=', 'n'),
                                                    ('order_id.date_order', '>=', one),
                                                    ('order_id.date_order', '<=', two)])
        for o in orders:
            res.append({
                'orden':o.order_id.name,
                'fecha': o.create_date,
                'producto': o.product_id.name,
                'importe': o.price_subtotal_incl,
                })
            sum += o.price_subtotal_incl
        return res, sum

    @api.multi
    def get_report_individual_details(self):
        action = self.get_details()
        if self.check_mail:
            self.send_mail_report(action)
        return action

    @api.multi
    def get_details(self):
        days = (self.end_date-self.start_date).days
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
        return self.env.ref('credit.action_report_credit_summary_individual').report_action(self, data=data, config=False)


    @api.multi
    def send_mail_report(self, action):
        template = self.env.ref('credit.email_template_reporte_credito_individual')
        template.report_template = action
        template = template.generate_email(self.id)
        self.send(template)# enviar


    def send(self, template):
        # objeto odoo de correo
        mail = self.env['mail.mail']
        mail_data={
            'subject':'Reporte De Crédito Individual',
            'body_html': template['body_html'],
            'email_to': self.partner_id.email,
            'email_from': template['email_from'],
        }
        mail_out=mail.create(mail_data)
        if mail_out:
            mail.send(mail_out)
            _logger.info("Reporte de Pos Enviado📬")