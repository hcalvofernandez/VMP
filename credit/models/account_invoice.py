# -*- coding:utf-8 -*-

from odoo import models, fields, api

from datetime import timedelta


class AccountInvoice(models.Model):
    _inherit = 'account.invoice'

    pos_order_ids = fields.One2many('pos.order', 'invoice_id', string="Órdenes de Crédito")
    count_pos_order = fields.Integer(string='Cantidad de órdenes', compute='compute_count_orders')

    @api.depends('pos_order_ids')
    def compute_count_orders(self):
        for invoice in self:
            if invoice.pos_order_ids:
                invoice.count_pos_order = len(invoice.pos_order_ids)
            else:
                invoice.count_pos_order = 0


    @api.multi
    def show_credit_orders(self):
        self.ensure_one()
        if self.pos_order_ids:
            return {
            'name': "Órdenes de Crédito",
            'type': 'ir.actions.act_window',
            'res_model': "pos.order",
            'view_mode': "tree,form",
            'domain': [('id', 'in', self.pos_order_ids.ids)]
            }

