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
    #company_id = field_name_id = fields.Many2one('res.company',string='Compañia')


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


