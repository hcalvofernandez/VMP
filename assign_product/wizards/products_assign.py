# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class product_assign(models.TransientModel):
    _name = 'product.assign'
    _rec_name = 'company_id'
    _description = 'Assign products an company'

    def get_product_domain(self):
        return [('es_insumo', '=', True), '|',('company_id', '=', False), '|',('company_id','=',self.env.user.company_id.id), ('company_id','child_of',[self.env.user.company_id.id])]

    def get_company_domain(self):
        return ['|', ('id','=',self.env.user.company_id.id), ('id','child_of',[self.env.user.company_id.id])]

    product_ids = fields.Many2many(required=True, comodel_name='product.template', string='Productos',domain=get_product_domain)
    company_id = fields.Many2one(required=True, comodel_name='res.company', string='Compañia',domain=get_company_domain)
    
    def assign_products_company(self):
        self.product_ids.write({'company_id': self.company_id.id})
    

    
