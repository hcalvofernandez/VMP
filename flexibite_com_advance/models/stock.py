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

from openerp import models, fields, api, _
import pytz
from pytz import timezone
from datetime import datetime, date, timedelta


class stock_warehouse(models.Model):
    _inherit = 'stock.warehouse'

    @api.model
    def disp_prod_stock(self, product_id, shop_id):
        stock_line = []
        total_qty = 0
        shop_qty = 0
        quant_obj = self.env['stock.quant']
        for warehouse_id in self.search([]):
            product_qty = 0.0
            ware_record = warehouse_id
            location_id = ware_record.lot_stock_id.id
            if shop_id:
                loc_ids1 = self.env['stock.location'].search(
                    [('location_id', 'child_of', [shop_id])])
                stock_quant_ids1 = quant_obj.search([('location_id', 'in', [
                                                    loc_id.id for loc_id in loc_ids1]), ('product_id', '=', product_id)])
                for stock_quant_id1 in stock_quant_ids1:
                    shop_qty = stock_quant_id1.quantity

            loc_ids = self.env['stock.location'].search(
                [('location_id', 'child_of', [location_id])])
            stock_quant_ids = quant_obj.search([('location_id', 'in', [
                                               loc_id.id for loc_id in loc_ids]), ('product_id', '=', product_id)])
            for stock_quant_id in stock_quant_ids:
                product_qty += stock_quant_id.quantity
            stock_line.append([ware_record.name, product_qty,ware_record.lot_stock_id.id])
            total_qty += product_qty
        return stock_line, total_qty, shop_qty


class StockLocation(models.Model):
    _inherit = 'stock.location'

    @api.model
    def filter_location_wise_product(self, location_id):
        location_id = int(location_id)
        if location_id:
            location_name = self.env['stock.location'].browse(location_id).display_name
        list_product = self.env['product.product'].with_context({'location': location_id}). \
            search([('available_in_pos', '=', True), ('type', '=', 'product')])
        all_products = []
        for product in list_product:
            stock_ids = self.env['stock.quant'].search([('product_id', '=', product.id),
                                                    ('location_id', '=', location_id)])
            if stock_ids:
                for stock in stock_ids:
                    if stock.quantity <= 0.00:
                        all_products.append(stock.product_id.id)
            else:
                all_products.append(product.id)
        return {location_name: all_products}

    @api.multi
    def get_current_date_x(self):
        if self.env.user.tz:
            tz = timezone(self.env.user.tz)
        else:
            tz = pytz.utc
        if tz:
            c_time = datetime.now(tz)
            return c_time.strftime('%d/%m/%Y')
        else:
            return date.today().strftime('%d/%m/%Y')

    @api.multi
    def get_current_time_x(self):
        if self.env.user.tz:
            tz = timezone(self.env.user.tz)
        else:
            tz = pytz.utc
        if tz:
            c_time = datetime.now(tz)
            return c_time.strftime('%I:%M %p')
        else:
            return datetime.now().strftime('%I:%M:%S %p')

    @api.multi
    def get_inventory_details(self):
        product_category = self.env['product.category'].search([])
        product_product = self.env['product.product']
        pos_order = self.env['pos.order'].search([])
        inventory_records = []
        final_list = []
        product_details = []
        for order in pos_order:
            if order.location_id.id == self.id:
                for line in order.lines:
                    product_details.append({
                        'id': line.product_id.id,
                        'qty': line.qty,
                    })
        custom_list = []
        for each_prod in product_details:
            if each_prod.get('id') not in [x.get('id') for x in custom_list]:
                custom_list.append(each_prod)
            else:
                for each in custom_list:
                    if each.get('id') == each_prod.get('id'):
                        each.update({'qty': each.get('qty') + each_prod.get('qty')})
        if custom_list:
            for each in custom_list:
                product_id = product_product.browse(each.get('id'))
                inventory_records.append({
                    'product_id': [product_id.id, product_id.name],
                    'category_id': [product_id.id, product_id.categ_id.name],
                    'used_qty': each.get('qty'),
                    'quantity': product_id.with_context({'location': self.id, 'compute_child': False}).qty_available,
                    'uom_name': product_id.uom_id.name or ''
                })
            if inventory_records:
                temp_list = []
                temp_obj = []
                for each in inventory_records:
                    if each.get('product_id')[0] not in temp_list:
                        temp_list.append(each.get('product_id')[0])
                        temp_obj.append(each)
                    else:
                        for rec in temp_obj:
                            if rec.get('product_id')[0] == each.get('product_id')[0]:
                                qty = rec.get('quantity') + each.get('quantity');
                                rec.update({'quantity': qty})
                final_list = sorted(temp_obj, key=lambda k: k['quantity'])
        return final_list or []

    @api.model
    def load_pos_category_ids(self, stock_location_id):
        category_ids = []
        stock_location_obj = self.browse(int(stock_location_id))
        if stock_location_obj:
            if stock_location_obj.product_ids:
                for product in stock_location_obj.product_ids:
                    parent_categ_ids = self.env['pos.category'].search([('id','parent_of',[product.pos_categ_id.id])])
                    category_ids += parent_categ_ids.ids
            if stock_location_obj.category_ids:
                for category in stock_location_obj.category_ids:
                    child_categ_ids = self.env['pos.category'].search([('id','child_of',[category.id])])
                    category_ids += child_categ_ids.ids
                    par_categ_ids = self.env['pos.category'].search([('id','parent_of',[category.id])])
                    category_ids += par_categ_ids.ids
        if category_ids:
            return category_ids
        return False

    category_ids = fields.Many2many("pos.category",string="Category")
    product_ids = fields.Many2many("product.product",string="Product")


class stock_picking(models.Model):
    _inherit = "stock.picking"

    @api.model
    def do_detailed_internal_transfer(self, vals):
        move_lines = []
        if vals and vals.get('data'):
            for move_line in vals.get('data').get('moveLines'):
                move_lines.append((0, 0, move_line))
            picking_vals = {'location_id': vals.get('data').get('location_src_id'),
                            'state': 'draft',
                            'move_lines': move_lines,
                            'location_dest_id': vals.get('data').get('location_dest_id'),
                            'picking_type_id': vals.get('data').get('picking_type_id')}
            picking_id = self.create(picking_vals)
            if picking_id:
                if vals.get('data').get('state') == 'confirmed':
                    picking_id.action_confirm()
                if vals.get('data').get('state') == 'done':
                    picking_id.action_confirm()
                    picking_id.action_assign()
                    picking_id.button_validate()
                    stock_transfer_id = self.env['stock.immediate.transfer'].search([('pick_ids', '=', picking_id.id)],
                                                                                    limit=1)
                    if stock_transfer_id:
                        stock_transfer_id.process()
            return [picking_id.id, picking_id.name]

class StockMove(models.Model):
   _inherit = 'stock.move'
   
   @api.model
   def create(self, vals):
       res = super(StockMove, self).create(vals)
       self._cr.execute("""
               update product_product set write_date = '%s'  where id = %s;
           """%(res.write_date, res.product_id.id))
       return res

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: