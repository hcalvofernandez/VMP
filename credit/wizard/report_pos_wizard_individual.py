# -*- coding:utf-8 -*-
import locale

from odoo import models, fields, api
from odoo.exceptions import ValidationError
from dateutil import relativedelta
from datetime import datetime

import logging


_logger = logging.getLogger(__name__)


class ReportPosIndividualWizard(models.TransientModel):
    _name = 'credit.report_pos_individual_wizard'
    _description = 'Wizard para el reporte de las ventas en POS Individual '


    start_date = fields.Datetime(computed='_default_date_report', required=True, string='Fecha y Hora inicial',)
    end_date  = fields.Datetime(computed='_default_date_report', required=True, string='Fecha y Hora Final',)
    partner_id = fields.Many2one('res.partner', string='Cliente',)
    check_mail = fields.Boolean(string='Enviar por Correo',)
    check_format_date = fields.Boolean(string="Reporte Diario", default=True)

    @api.multi
    @api.onchange('partner_id')
    def _default_date_report(self):
        h_min = datetime.max.time()
        h_max = datetime.max.time()
        contracts = self.env['contract.contract'].search([('partner_id','=',self.partner_id.parent_id.id),('active','=',True)])
        for c in contracts:
            for lc in c.contract_line_ids:
                self.start_date = datetime.combine(lc.next_period_date_start, h_min)
                self.end_date = datetime.combine(lc.next_period_date_end, h_max)

    @api.multi
    @api.onchange('check_format_date')
    def format_date(self):
        if self.check_format_date:
            self.start_date = datetime.strftime(self.start_date,'%Y-%m-%d')+'00:00:00.00000'
            self.end_date = datetime.strftime(self.end_date,'%Y-%m-%d')+'23:59:59.99999'


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