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
    credit_schemes_line_ids = fields.Many2many(
        'credit.credit_schemes',
        string='Esquemas de Crédito',
    )

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
