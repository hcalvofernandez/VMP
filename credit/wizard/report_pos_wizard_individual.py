# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError
from dateutil import relativedelta
from datetime import datetime

import logging


_logger = logging.getLogger(__name__)


class ReportPosIndividualWizard(models.TransientModel):
    _name = 'credit.report_pos_individual_wizard'
    _description = 'Wizard para el reporte de las ventas en POS Individual '


    start_date = fields.Datetime(computed='_default_date_report', string='Fecha y Hora inicial',)
    end_date  = fields.Datetime(computed='_default_date_report', string='Fecha y Hora Final',)
    partner_id = fields.Many2one('res.partner',string='Cliente',)
    check_mail = fields.Boolean(string='Enviar por Correo',)



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
    def consult_report_individual_details(self):
        if self.check_mail:
            self.send_mail_report()
        one = self.start_date
        two = self.end_date
        # start = one.strftime("%m-%d-%Y %H:%M:%S.%f")
        # end = two.strftime("%m-%d-%Y %H:%M:%S.%f")
        res= []
        sum = 0
        orders = self.env['pos.order.line'].search([('order_id.partner_id.id', '=', self.partner_id.id),
                                                    ('order_id.state_order_fac', '=', 'n'),
                                                    ('order_id.order_type', '=', 'Crédito'),
                                                    ('order_id.is_postpaid', '=', True),
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
        days = (self.end_date-self.start_date).days
        orders, total = self.consult_report_individual_details()
        print(total)
        data = {
            'orders': orders,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'total': total,
            'client': self.partner_id.name,
            'client_number': self.partner_id.client_number,
            'days': days,
            }
        return self.env.ref('credit.action_report_credit_summary_individual').report_action(self, data=data,config=False)


    @api.multi
    def send_mail_report(self):
        template = self.env['mail.template'].search([('name','=','Reporte de Crédito')])
        template = template.generate_email(self.id)
        self.send(template) # enviar


    def send(self, template):
        # objeto odoo de correo
        mail = self.env['mail.mail']
        mail_data={
            'subject':'Reporte De Crédito Individual',
            'body_html': template['body_html'],
            'email_to': 'francisco-castillo-moo@hotmail.com',
            'email_from': template['email_from'],
        }
        mail_out=mail.create(mail_data)
        if mail_out:
            mail.send(mail_out)
            _logger.info("Reporte de Pos Enviado📬")