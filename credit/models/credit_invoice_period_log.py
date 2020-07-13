# -*- coding:utf-8 -*-

from odoo import models, fields, api

from datetime import datetime


class CreditInvoicePeriodLog(models.Model):
    _name = "credit.invoice_period_log"
    _rec_name = 'name'

    name = fields.Char(string="Periodo", compute='compute_name', store=True)
    start_date = fields.Date(string="Fecha Inicio")
    end_date = fields.Date(string="Fecha Fin")
    order_ids = fields.One2many("pos.order", "period_log_id",string="Ordenes")
    contract_line_id = fields.Many2one("contract.line", string="Linea de Contrato")
    state = fields.Selection([('new', 'Nuevo'), ('invoiced', 'Facturado')], string="Estado", default='new')

    @api.depends('start_date', 'end_date', 'contract_line_id.contract_id')
    def compute_name(self):
        for period in self:
            if period.start_date:
                period.name = datetime.strftime(period.start_date, "%d-%m-%Y")
            if period.end_date:
                period.name += " a " + datetime.strftime(period.end_date, "%d-%m-%Y") + " "
            if period.contract_line_id.contract_id.name:
                period.name += period.contract_line_id.contract_id.name
