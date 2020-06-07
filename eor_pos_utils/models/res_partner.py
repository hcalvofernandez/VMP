# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models

_logger = logging.getLogger("______________________________________________________" + __name__)


class ProductProduct(models.Model):
    _inherit = 'product.product'
    
    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        if 'search_product' in self.env.context:
            partner_id = self.env.context.get('partner_id')
            Contracts = self.env['contract.contract'].search([('partner_id', '=', partner_id)])
            if Contracts:
                args += [('id', 'in', Contracts.mapped('product_ids').ids)]
        return super(ProductProduct, self).search(args, offset, limit, order, count)


class ResPartner(models.Model):
    _inherit = 'res.partner'
    
    def _compute_order_count(self):
        pos_orderobj = self.env['pos.order']
        for partner in self:
            partner.order_postpago_count = ''

    
    client_pin = fields.Char(string="Pin de seguridad")
    order_postpago_count = fields.Integer(string="Ordenes postpago", compute="_compute_order_count")
    numero_tarjeta = fields.Char(string="Número de tarjeta")
    esquema_subsidio_ids = fields.Many2many('contract.scheme.contract', string='Esquemas de subsidio')
    product_ids = fields.Many2many('product.product', string="Productos")
    credit_blocked = fields.Boolean(string="Bloquear Saldo", default=False)
    # TODO: Esquema por producto