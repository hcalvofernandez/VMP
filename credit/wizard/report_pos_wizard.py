# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError
from dateutil import relativedelta
from datetime import datetime

import logging


_logger = logging.getLogger(__name__)


class ReportPosWizard(models.TransientModel):
    _name = 'credit.report_pos_wizard'
    _description = 'Wizard para el reporte de las ventas en POS '


    start_date = fields.Datetime(string='Fecha y Hora inicial')
    end_date  = fields.Datetime(string='Fecha y Hora Final', default=lambda self: fields.datetime.now())
    company_id = fields.Many2one('res.company',string='Compañia', default = lambda self: self.env.user.company_id.id,)


    @api.multi
    def consult_credit_details(self):
        one = self.start_date
        two = self.end_date
        start = one.strftime("%m-%d-%Y %H:%M:%S.%f")
        end = two.strftime("%m-%d-%Y %H:%M:%S.%f")
        orders = self.env['pos.order'].search([('company_id','=',self.company_id.id),('state_order_fac','=','n'),('order_type','=','Cŕedito'),('is_postpaid','=',True),('date_order','>=',start),('date_order','<=',end)])
        importes_por_persona = dict()
        res = []
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
        return res

    @api.multi
    def get_report_credit_details(self):
        data = {
            'orders': self.consult_credit_details(),
            'start_date': self.start_date,
            'end_date': self.end_date,
            'logo': self.company_id.logo,
            }
        return self.env.ref('credit.action_report_credit_summary').report_action(self, data=data,config=False)


    @api.multi
    def sale_report_pos(self):
        one = self.start_date
        two = self.end_date
        start = one.strftime("%m-%d-%Y %H:%M:%S.%f")
        end = two.strftime("%m-%d-%Y %H:%M:%S.%f")
        view_id = self.env.ref('point_of_sale.view_pos_order_tree').id
        domain = ['&',('date_order','>=',start),('date_order','<=',end)]
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
    def sale_report_pdf(self):
        raise ValidationError("VENTAS REPORT")

    @api.multi
    def restart_credits(self):
        raise ValidationError("REINCIAR CREDITOS")


