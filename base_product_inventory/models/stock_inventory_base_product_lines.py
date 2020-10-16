# -*- coding: utf-8 -*-

from odoo import models, fields, api, _


class StockInventoryBaseProductLines(models.Model):
    _name = "base_product_inventory.base_product_line"
    _description = "Include the base product in inventory adjustment"

    stock_inventory_id = fields.Many2one('stock.inventory', string='Inventory')
    stock_inventory_lines = fields.One2many('stock.inventory.line', 'base_product_id', string='Inventory Lines',
                                            ondelete='cascade')
    state_base_line = fields.Selection(related="stock_inventory_id.state")
    product_tmpl_id = fields.Many2one('product.template', string='Product', required=True, readonly=True)
    location_id = fields.Many2one(related="product_tmpl_id.location_id")
    base_uom = fields.Many2one('uom.uom', related='product_tmpl_id.uom_id', store=True, string='UoM')
    base_standard_price = fields.Float(string="Unit Cost")
    base_theoretical_qty = fields.Float(string='Theoretical Quantity', readonly=True)
    base_product_qty = fields.Float(string='Real Quantity', digits=(16, 3))
    base_difference_qty = fields.Float(string='Difference', compute='_compute_difference')

    @api.depends('base_theoretical_qty', 'base_product_qty')
    def _compute_difference(self):
        for line in self:
            line.base_difference_qty = abs(line.base_theoretical_qty - line.base_product_qty)

    @api.onchange('product_tmpl_id')
    def onchange_product_tmpl_id(self):
        self.ensure_one()
        self.base_theoretical_qty = self.product_tmpl_id.qty_available
        self.base_product_qty = self.product_tmpl_id.qty_available
        self.base_standard_price = self.with_context(
            {'force_company': self.stock_inventory_id.company_id.id}).product_tmpl_id.base_standard_price
