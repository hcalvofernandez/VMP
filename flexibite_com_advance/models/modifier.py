# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
#################################################################################

from odoo import models, fields,api, _

class ProductModifier(models.Model):
    _name = 'product.modifier'
    _rec_name = 'product_id'
    _description = 'product modifier'

    product_id = fields.Many2one('product.product', 'Modifier Name',required=True)
    price = fields.Float('Price',required=True)
    icon = fields.Binary('Icon', filters='*.png,*.gif,*.jpg,*.jpeg')
    qty = fields.Float('QTY')
    pos_order_line_id = fields.Many2one('pos.order.line', 'Line')
    active = fields.Boolean(string="Active", default=True)

    @api.multi
    @api.onchange('product_id')
    def onchange_product_id(self):
        self.ensure_one()
        self.icon = self.product_id.image_medium

class modifier_order_line(models.Model):
    _name = 'modifier.order.line'
    _description = 'modifier order line'

    prod_mod_id = fields.Many2one("product.modifier", "Product Modifier")
    line_id = fields.Many2one("pos.order.line", "Order Line")
    modifier_id = fields.Many2one("product.modifier", "Modifier")
    qty = fields.Float("QTY")
    name = fields.Char("Name")
    price = fields.Char("Price")
    product_id = fields.Many2one('product.product', 'Modifier Name',required=True)

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: