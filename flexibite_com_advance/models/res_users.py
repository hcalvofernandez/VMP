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

from odoo import models, fields, api, _

class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        if self._context.get('from_sales_person'):
            users = []
            pos_users_ids = self.env.ref('point_of_sale.group_pos_user').users.ids
            sale_person_ids = self.search([('id', 'in', pos_users_ids),
                                           ('user_role', '=', 'ass_cashier')])
            selected_sales_persons = []
            for user in pos_users_ids:
                user_id = self.browse(user)
                if user_id.sales_persons:
                    selected_sales_persons.append(user_id.sales_persons.ids)
            if sale_person_ids:
                users.append(sale_person_ids.ids)
            if users:
                args += [['id', 'in', users[0]]]
            if selected_sales_persons:
                args += [['id', 'not in', selected_sales_persons[0]]]
        return super(ResUsers, self).name_search(name, args=args, operator=operator, limit=limit)

    @api.constrains('shop_ids')
    def check_location_id(self):
            for shop_id in self.shop_ids:
                if shop_id.company_id not in self.company_ids:
                    raise Warning(_("Select Shops according to user's company!"))

    @api.model
    def get_pos_child_categ_ids(self, user_id):
        user = self.browse(user_id)
        categ_list = []
        if user and user.pos_category_ids:
            for each in user.pos_category_ids:
                categ_ids = self.env['pos.category'].search([('id', 'child_of', each.id)])
                if categ_ids:
                    [categ_list.append(x.id) for x in categ_ids]
            categ_list = list(set(categ_list))
        return categ_list

    login_with_pos_screen = fields.Boolean(string="Login with Direct POS")
    # default_pos = fields.Many2one('pos.config',string="POS Config")
    user_role = fields.Selection([('cashier','Cashier'),
                                  ('ass_cashier','Asst. Cashier'),
                                  ('delivery_user','Delivery User'),
                                  ('cook','Cook'),
                                  ('cook_manager','Cook Manager')], default='cashier', string="User Role")
    pos_category_ids = fields.Many2many('pos.category', 'pos_categ_user_rel', 'categ_id', 'user_id', string="POS Categories")
    sales_persons = fields.Many2many('res.users','sales_person_rel','sales_person_id','user_id', string='Sales Person')
    cook_user_ids = fields.Many2many('res.users','cook_user_rel','user_id','cook_user_id', string='Cook Users')

    access_ereceipt = fields.Boolean("E-Receipt", default=True)
    access_quick_cash_payment = fields.Boolean("Quick Cash Payment", default=True)
    access_order_note = fields.Boolean("Order Note", default=True)
    access_product_note = fields.Boolean('Product / Line Note', default=True)
    access_pos_return = fields.Boolean("Return Order/Products", default=True)
    access_reorder = fields.Boolean("Reorder", default=True)
    access_draft_order = fields.Boolean("Draft Order", default=True)
    access_rounding = fields.Boolean("Rounding Total", default=True)
    access_bag_charges = fields.Boolean("Bag Charges", default=True)
    access_delivery_charges = fields.Boolean("Delivery Charges", default=True)
    access_pos_lock = fields.Boolean("POS Screen Lock", default=True)
    access_keyboard_shortcut = fields.Boolean("Keyboard Shortcut", default=True)
    access_product_sync = fields.Boolean("Product Synchronization", default=True)
    access_display_warehouse_qty = fields.Boolean("Display Warehouse Quantity", default=True)
#     access_change_stock_locations = fields.Boolean("Change Stock Locations", default=True)
    access_pos_graph = fields.Boolean("POS Graph", default=True)
    access_x_report = fields.Boolean("X-Report", default=True)
    access_pos_loyalty = fields.Boolean("Loyalty", default=True)
    access_today_sale_report = fields.Boolean("Today Sale Report", default=True)
    access_money_in_out = fields.Boolean("Money In/Out", default=True)
    access_gift_card = fields.Boolean('Gift Card', default=True)
    access_gift_voucher = fields.Boolean('Gift Voucher', default=True)
    access_print_last_receipt = fields.Boolean("Print Last Receipt", default=True)
    access_pos_promotion = fields.Boolean("Promotion", default=True)
    lock_terminal = fields.Boolean("Lock Terminals", default=True)
    delete_msg_log = fields.Boolean("Delete Message Logs", default=True)
    access_show_qty = fields.Boolean("Display Stock", default=True)
    access_print_valid_days = fields.Boolean("Print Product Return Valid days", default=True)
    access_card_charges = fields.Boolean("Card Charges", default=True)
    access_wallet = fields.Boolean("Use Wallet", default=True)
    access_send_order_kitchen = fields.Boolean("Send to kitchen", default=True)
    access_modifiers = fields.Boolean("Modifiers", default=True)
    access_combo = fields.Boolean("Enable Combo", default=True)
    access_takeaway = fields.Boolean("Take Away", default=True)
    access_merge_table = fields.Boolean("Merge Table", default=True)
    access_pos_dashboard = fields.Boolean("Sales Dashboard", default=True)
    access_out_of_stock_details = fields.Boolean("Out of Stock", default=True)
    access_int_trans = fields.Boolean("Internal Stock Transfer", default=True)
    shop_ids = fields.Many2many("pos.shop", 'pos_shop_user_rel', 'shop_id', 'user_id', string='Allow Shops')
    allow_switch_store = fields.Boolean(string="Allow Switch Store", default=True)
    rfid_no = fields.Char('RFID No.')
    default_pos_ids = fields.Many2many('pos.config', 'default_pos_config_rel', string="Default Point of Sale(s)")

    @api.onchange('user_role')
    def _onchange_user_role(self):
        if self.user_role == 'cashier':
            self.access_ereceipt = True
            self.access_quick_cash_payment = True
            self.access_order_note = True
            self.access_product_note = True
            self.access_pos_return = True
            self.access_reorder = True
            self.access_draft_order = True
            self.access_rounding = True
            self.access_bag_charges = True
            self.access_delivery_charges = True
            self.access_pos_lock = True
            self.access_keyboard_shortcut = True
            self.access_product_sync = True
            self.access_display_warehouse_qty = True
            self.access_pos_graph = True
            self.access_x_report = True
            self.access_pos_loyalty = True
            self.access_today_sale_report = True
            self.access_money_in_out = True
            self.access_gift_card = True
            self.access_gift_voucher = True
            self.access_print_last_receipt = True
            self.access_pos_promotion = True
            self.lock_terminal = True
            self.delete_msg_log = True
            self.access_show_qty = True
            self.access_print_valid_days = True
            self.access_card_charges = True
            self.access_wallet = True
            self.access_send_order_kitchen = True
            self.access_modifiers = True
            self.access_combo = True
            self.access_takeaway = True
            self.access_merge_table = True
            self.access_pos_dashboard = True
            self.access_out_of_stock_details = True
            self.access_int_trans = True
            self.allow_switch_store = True

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: