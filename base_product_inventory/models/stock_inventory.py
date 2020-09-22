# -*- coding: utf-8 -*-

from odoo import models, fields, api, _

import pytz


class StockInventory(models.Model):
    _inherit = 'stock.inventory'

    category_ids = fields.Many2many('product.category', string="Product Categories",
                                    readonly=True, states={'draft': [('readonly', False)]},
                                    help="Specify Product Categories to focus your inventory on particular categories.")
    base_product_ids = fields.One2many('base_product_inventory.base_product_line', 'stock_inventory_id',
                                       string='Base Product Lines')
    product_tmpl_id = fields.Many2one('product.template', string='Inventoried Product')
    application_date = fields.Datetime(string='Application Date', required=True)

    @api.model
    def _selection_filter(self):
        """ Get the list of filter allowed according to the options checked
        in 'Settings\Warehouse'. """
        res = super(StockInventory, self)._selection_filter()
        res.insert(2, ('categories', _('Multiple product categories')))
        return res

    
    def action_reset_product_qty(self):
        res = super(StockInventory, self).action_reset_product_qty()
        self.mapped('base_product_ids').write({'base_product_qty': 0})
        return res

    def action_cancel_draft(self):
        super(StockInventory, self).action_cancel_draft()
        self.write({
            'base_product_ids': [(5,)],
        })

    def action_start(self):
        for inventory in self.filtered(lambda x: x.state not in ('done', 'cancel')):
            vals = {'state': 'confirm', 'date': fields.Datetime.now()}
            if (inventory.filter != 'partial') and not inventory.line_ids:
                vals.update({'base_product_ids': [(0, 0, {
                    'product_tmpl_id': line['id'],
                    'base_theoretical_qty': line['qty_available'],
                    'base_product_qty': line['qty_available']}) for line in
                                                  inventory._get_base_product_lines_values()]})
                # vals.update(
                #     {'line_ids': [(0, 0, line_values) for line_values in inventory._get_inventory_lines_values()]})
            inventory.write(vals)
        return True

    def _get_base_product_lines_values(self):
        domain = [('type', '=', 'product')]
        product_ids = self.env['product.template']
        if self.company_id:
            product_ids = product_ids.with_context(force_company=self.company_id.id)

        # #case 1: Filter on One owner only or One product for a specific owner
        # if self.partner_id:
        #     domain.append(('owner_id', '=', self.partner_id.id,))
        # #case 2: Filter on One Lot/Serial Number
        # if self.lot_id:
        #     domain.append(('lot_id', '=', self.lot_id.id))
        # case 3: Filter on One product
        if self.filter == 'product':
            domain.append(('id', '=', self.product_tmpl_id.id))
        # #case 4: Filter on A Pack
        # if self.package_id:
        #     domain.append(('package_id', '=', self.package_id.id))
        # case 5: Filter on One product category + Exahausted Products
        if self.filter == 'category':
            domain.append(('categ_id', 'child_of', self.category_id.id))
        if self.filter == 'categories':
            domain.append(('categ_id', 'child_of', self.category_ids.ids))
        if not self.exhausted:
            domain.append(('qty_available', '>', 0))

        products = product_ids.search(domain, order='name asc').read(['id', 'qty_available'])
        return products

    def action_validate(self):
        self.add_line_ids()
        return super(StockInventory, self).action_validate()

    def add_line_ids(self):
        # It add the product line ids from the base product list.
        # It takes the real value in the base product and add a
        # quantity to each variant according the itself available quantity
        data = []
        locations = self.env['stock.location'].search([('id', 'child_of', [self.location_id.id])])
        for line in self.base_product_ids:
            qty = line.base_product_qty
            variants = self.env['product.product'].search([('product_tmpl_id', '=', line.product_tmpl_id.id),
                                                           ('location_id', 'in', locations)])

            size = len(variants)
            i = 0
            for variant in variants:
                end_iteration = (size-1 == i)
                i += 1
                remaining_variant = qty
                if remaining_variant >= variant.qty_available and not end_iteration:
                    qty_variant = variant.qty_available
                elif remaining_variant >= variant.qty_available and end_iteration:
                    qty_variant = remaining_variant
                else:
                    qty_variant = remaining_variant
                qty -= qty_variant
                if not (qty_variant == 0 and variant.qty_available == 0):
                    data.append((0, 0, {
                        'product_id': variant.id,
                        'product_qty': qty_variant,
                        'location_id': self.location_id.id,
                        'prod_lot_id': False,
                        'package_id': False,
                        'partner_id': False,
                        'theoretical_qty': variant.qty_available,
                        'product_uom_id': variant.uom_id.id
                    }))

        self.write({'line_ids': data})

    @api.model
    def cron_apply_validation(self):
        _now = fields.Datetime.now().astimezone(pytz.utc)

        domain = [('state', 'in', ['confirm']), ('application_date', '<=', _now)]
        inventories_to_validate = self.search(domain)
        for inv in inventories_to_validate:
            inv.action_validate()


class StockInventoryLine(models.Model):
    _inherit = 'stock.inventory.line'

    base_product_id = fields.Many2one('base_product_inventory.base_product_line', string='Base Product',
                                      ondelete='cascade')
