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

from odoo import models, api, fields, _
from datetime import datetime


class ProductTemplate(models.Model):
    _inherit = "product.template"

    @api.model
    def create(self, vals):
        res = super(ProductTemplate, self).create(vals)
        if res:
            if not vals.get('barcode') and self.env['ir.config_parameter'].sudo().get_param('gen_ean13'):
                barcode_str = self.env['barcode.nomenclature'].sanitize_ean("%s%s" % (res.id, datetime.now().strftime("%d%m%y%H%M")))
                res.write({'barcode': barcode_str})
        return res

    @api.multi
    def write(self, vals):
        res = super(ProductTemplate, self).write(vals)
        for each in self:
            product_ids = self.env['product.product'].search([('product_tmpl_id', '=', each.id)])
            if product_ids:
                self._cr.execute("""
                    update product_product set write_date = '%s'  where id in (%s);
                """%(each.write_date, ','.join(map(str, product_ids._ids))))
        return res


    @api.model
    def create_from_ui(self, product):
        if product.get('image'):
            product['image'] = product['image'].split(',')[1]
        id = product.get('id')
        if id:
            product_tmpl_id = self.env['product.product'].browse(id).product_tmpl_id
            if product_tmpl_id:
                product_tmpl_id.write(product)
        else:
            id = self.env['product.product'].create(product).id
        return id
    
    is_packaging = fields.Boolean("Is Packaging")
    loyalty_point = fields.Integer("Loyalty Point")
    is_dummy_product = fields.Boolean("Is Dummy Product")
    modifier_line = fields.Many2many('product.modifier', string='Modifier Line')
    is_combo = fields.Boolean("Is Combo")
    product_combo_ids = fields.One2many('product.combo', 'product_tmpl_id')
    non_refundable = fields.Boolean(string="Non Refundable")
    return_valid_days = fields.Integer(string="Return Valid Days")
    send_to_kitchen = fields.Boolean(string="Send To Kitchen", default=True)
    priority = fields.Selection([('low','Baja'),('medium','Media'),('high','Alta')], string="Priority")
    make_time = fields.Integer("Making Time")

class ProductProduct(models.Model):
    _inherit = "product.product"

    @api.model
    def create(self, vals):
        if vals.get('uom_id'):
            vals['uom_po_id'] = vals.get('uom_id')
        res = super(ProductProduct, self).create(vals)
        if res:
            if not vals.get('barcode') and self.env['ir.config_parameter'].sudo().get_param('gen_ean13'):
                barcode_str = self.env['barcode.nomenclature'].sanitize_ean("%s%s" % (res.id, datetime.now().strftime("%d%m%y%H%M")))
                res.write({'barcode': barcode_str})
        return res
    
    @api.model
    def load_latest_product(self,write_date,fields,context):
        variant_ids = self.with_context(context).search([('write_date','>',write_date),("sale_ok", "=", True),("available_in_pos", "=", True)])
        tmpl_ids = [x.product_tmpl_id.id for x in variant_ids]
        tmpl_ids = list(dict.fromkeys(tmpl_ids))
        product_ids = self.env['product.template'].search([('id','in',tmpl_ids)])
        return {
            'product_tmpl':product_ids.read(),
            'variants': variant_ids.read(fields)
        }


    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        args = args
        if self._context.get('is_required', False):
            args += [['available_in_pos', '=', True]]
        if self._context.get('category_from_line', False):
            pos_category_id = self.env['pos.category'].browse(self._context.get('category_from_line'))
            args += [['pos_categ_id', 'child_of', pos_category_id.id],['available_in_pos', '=', True]]
        return super(ProductProduct, self).name_search(name, args=args, operator='ilike', limit=100)

    @api.model
    def calculate_product(self, config_id):
        user_allowed_company_ids = self.env.user.company_ids.ids
        config = self.env['pos.config'].browse(config_id)
        product_ids = False
        dummy_product_ids = self.search([('is_dummy_product','=',True)]).ids
        setting = self.env['res.config.settings'].search([], order='id desc', limit=1, offset=0)
        pos_session = self.env['pos.session'].search([('config_id', '=', config.id), ('state', '=', 'opened')], limit=1)
        if pos_session and config.multi_shop_id and pos_session.shop_id:
            product_ids = pos_session.get_products_category_data(config_id)
            tip_id = self.env.ref('point_of_sale.product_product_tip', False)
            if tip_id:
                dummy_product_ids.append(tip_id.id)
            return product_ids + dummy_product_ids
        else:
            if setting and setting.group_multi_company and not setting.company_share_product:
                product_ids = self.with_context({'location':config.stock_location_id.id}).search([('product_tmpl_id.sale_ok', '=', True), ('active', '=', True),
                                   ('product_tmpl_id.active', '=', True),
                                   '|', ('product_tmpl_id.company_id', 'in', user_allowed_company_ids),
                                   ('product_tmpl_id.company_id', '=', False),
                                   ('available_in_pos', '=', True)])
            else:
                product_ids = self.with_context({'location':config.stock_location_id.id}).search([('product_tmpl_id.sale_ok', '=', True), ('active', '=', True),
                               ('product_tmpl_id.active', '=', True),
                               ('available_in_pos', '=', True)])
        
        if product_ids:
            return product_ids.ids
        else:
            return []

class product_category(models.Model):
    _inherit = "pos.category"

    loyalty_point = fields.Integer("Loyalty Point")
    return_valid_days = fields.Integer("Return Valid Days")

class ProductCombo(models.Model):
    _name = 'product.combo'
    _description = 'product combo'

    product_tmpl_id = fields.Many2one('product.template') 
    require = fields.Boolean("Required", Help="Don't select it if you want to make it optional")
    pos_category_id = fields.Many2one('pos.category', "Categories")
    product_ids = fields.Many2many('product.product',string="Products")
    no_of_items = fields.Integer("No. of Items", default= 1)

    @api.onchange('require', 'pos_category_id')
    def onchage_require(self):
        if self.require:
            self.pos_category_id = False
            self.product_ids = [(5,)]
        if self.pos_category_id:
            self.product_ids = [(5,)]


# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
