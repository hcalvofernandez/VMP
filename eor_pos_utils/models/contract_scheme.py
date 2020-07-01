# -*- coding: UTF-8 -*-

from odoo import api, fields, models


class ContractSchemeContract(models.Model):
    _name = 'contract.scheme.contract'
    _description = 'Modelo Esquema de Subsidio'
    _rec_name = 'name'

    name = fields.Char(string='Nombre')
    qty = fields.Float(string='Cantidad')
    type_sub = fields.Selection([
        ('ajuste', 'Ajuste'),
        ('porcentaje', 'Porcentaje')
    ], string='Tipo subsidio', default="ajuste")
    product_id = fields.Many2one('product.product', string="Producto", domain="[('available_in_pos', '=', True)]")