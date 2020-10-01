# -*- coding: utf-8 -*-
from odoo import fields, models


class Company(models.Model):
    _inherit = 'res.company'

    product_printer = fields.Char()
    location_printer = fields.Char()
    shipping_printer = fields.Char()
    product_height = fields.Float(string="Product Height", default=1.0)
    product_width = fields.Float(string="Product Width", default=1.25)
    location_height = fields.Float(string="Location Height", default=1.0)
    location_width = fields.Float(string="Location Width", default=1.25)
    shipping_height = fields.Float(string="Shipping Height", default=1.0)
    shipping_width = fields.Float(string="Shipping Width", default=1.25)
    print_onreceive_product = fields.Boolean(string='Print When Receive Product', help='Print Product Label When Receive Product')
    printer_type = fields.Selection([('zpl', 'ZPL'), ('epl', 'EPL')], string="Type", default="zpl")


class Picking(models.Model):
    _inherit = "stock.picking"

    print_onreceive_product = fields.Boolean(related='company_id.print_onreceive_product', string='Print When Receive Product', help='Print Product Label When Receive Product', store=True)
