# -*- coding: utf-8 -*-

from odoo import models, fields, api


class StockPicking(models.Model):
    _inherit = "stock.move"

    product_uom_qty_purchase = fields.Float(string="Initial Demand")
    real_quantity_done = fields.Float(string="Done", compute='_compute_real_quantity', inverse="_set_real_quantity")

    @api.depends('quantity_done')
    def _compute_real_quantity(self):
        for move in self:
            try:
                move.real_quantity_done = move.product_uom_qty_purchase/move.product_uom_qty*move.quantity_done
            except ZeroDivisionError:
                move.real_quantity_done = 0.0

    def _set_real_quantity(self):
        try:
            self.quantity_done = self.product_uom_qty/self.product_uom_qty_purchase*self.real_quantity_done
        except ZeroDivisionError:
            self.quantity_done = 0.0

