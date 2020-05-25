# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class Contract(models.Model):
    _inherit = 'contract.contract'

    esquema_subsidio_ids = fields.Many2many("contract.scheme.contract", 
    "contract_contract_scheme_rel", "contract_id", "scheme_id", "Esquema de subsidio")
    # TODO: Esquema de producto
    product_ids = fields.Many2many("product.product", string="Productos", domain="[('available_in_pos', '=', True)]")

    @api.multi
    def write(self, vals):
        partnerobj = self.env['res.partner']
        partner = partnerobj.sudo().browse(self.partner_id.id)
        if 'limit_credit' in vals:
             partner.sudo().write({
                 'credit_limit': vals['limit_credit']
             })
        if 'meal_plan_credit' in vals:
            partner.sudo().write({'meal_plan_limit': vals['meal_plan_credit']})
        return super(Contract, self).write(vals)



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
