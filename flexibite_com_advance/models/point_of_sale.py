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

from odoo import models, fields, api, tools, _
from datetime import datetime, date, time, timedelta
from dateutil.relativedelta import relativedelta
from openerp.tools import DEFAULT_SERVER_DATETIME_FORMAT
from odoo.exceptions import UserError
import time
from pytz import timezone
from odoo.tools import float_is_zero
import logging
import psycopg2
import pytz
from odoo import SUPERUSER_ID
from operator import itemgetter
from functools import partial
from timeit import itertools
import ast, sys
from odoo.addons import decimal_precision as dp


_logger = logging.getLogger('_______________________________________________________'+__name__)

class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_meal_plan = fields.Boolean("Gestión de Meal Plan")

    @api.constrains('time_interval','prod_qty_limit')
    def _check_time_interval(self):
        if self.enable_automatic_lock and self.time_interval < 0:
            raise Warning(_('Time Interval Not Valid'))
        if self.prod_qty_limit < 0:
            raise Warning(_('Restrict product quantity must not be negative'))

    @api.onchange('multi_shop_id')
    def on_change_multi_store_id(self):
        if self.multi_shop_id:
            self.stock_location_id = self.multi_shop_id.location_id.id
            self.restaurant_floor_ids = False
            self.restaurant_floor_ids = [[6, 0, self.multi_shop_id.floor_ids.ids]]

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        user_rec = self.env['res.users'].browse(self._uid)
        erp_manager_id = self.env['ir.model.data'].get_object_reference('base',
                                                                         'group_erp_manager')[1]
        if user_rec and erp_manager_id not in user_rec.groups_id.ids:
            if user_rec.shop_ids:
                args += ['|',('multi_shop_id', 'in', user_rec.shop_ids.ids),('multi_shop_id', '=', False)]
            if user_rec.default_pos_ids:
                args += [('id', '=', user_rec.default_pos_ids.ids)]
            res = super(PosConfig, self).search(args=args, offset=offset, limit=limit, order=order, count=count)
        else:
             res = super(PosConfig, self).search(args=args, offset=offset, limit=limit, order=order, count=count)
        return res

    @api.model
    def get_outstanding_info(self):
        return True

    @api.onchange('is_table_management')
    def _onchange_is_table_management(self):
        res = super(PosConfig, self)._onchange_is_table_management()
        if not self.is_table_management:
            self.restaurant_floor_ids = False
        return res

    @api.onchange('table_reservation')
    def _onchange_is_table_reservation(self):
        if not self.table_reservation:
            self.tabel_reservation_product_id = False
            self.table_reservation_charge = 0.00
            
    @api.multi
    def write(self, vals):
        res = super(PosConfig, self).write(vals=vals)
        if vals.get('multi_shop_id'):
            for each in self:
                each.on_change_multi_store_id()
        return res
    
    login_screen = fields.Boolean("Login Screen")
    enable_ereceipt = fields.Boolean('Send E-Receipt')
    enable_quick_cash_payment = fields.Boolean(string="Quick Cash Payment")
    validate_on_click = fields.Boolean(string="Validate On Click")
    cash_method = fields.Many2one('account.journal',"Cash Payment Method")
    payment_buttons = fields.Many2many(comodel_name='quick.cash.payment',
                                           relation='amount_button_name',
                                           column1='payment_amt_id', column2='pos_config_id')
    enable_order_note = fields.Boolean('Order Note')
    enable_product_note = fields.Boolean('Product / Line Note')
    enable_pos_return = fields.Boolean("Return Order/Products")
    return_authentication_user_ids = fields.Many2many('res.users','pos_config_return_auth_id',string="Return Order - Manager Approval")
    enable_reorder = fields.Boolean("Enable Reorder")
    last_days = fields.Char("Last Days")
    record_per_page = fields.Integer("Record Per Page")
    enable_draft_order = fields.Boolean("Draft Order")
    enable_rounding = fields.Boolean("Rounding Total")
    rounding_options = fields.Selection([("digits", 'Digits'), ('points','Points'),], string='Rounding Options', default='digits')
    rounding_journal_id = fields.Many2one('account.journal',"Rounding Payment Method")
    auto_rounding = fields.Boolean("Auto Rounding")
    enable_bag_charges = fields.Boolean("Bag Charges")
    enable_delivery_charges = fields.Boolean("Delivery Charges")
    delivery_product_id = fields.Many2one('product.product', 'Delivery Product')
    delivery_amount = fields.Float("Delivery Amount")
    enable_manual_lock = fields.Boolean(string="Manual")
    enable_automatic_lock = fields.Boolean(string="Automatic")
    time_interval = fields.Float(string="Time Interval (Minutes)")
    enable_keyboard_shortcut = fields.Boolean("Keyboard Shortcut")
    is_scan_product = fields.Boolean(string="Is Scan Product")
    product_sync = fields.Boolean("Product Synchronization")
    display_warehouse_qty = fields.Boolean("Display Warehouse Quantity")
#     change_stock_locations = fields.Boolean("Change Stock Locations")
    pos_graph = fields.Boolean("POS Graph")
    current_session_report = fields.Boolean("Current Session Report")
    x_report = fields.Boolean("X-Report")
    enable_pos_loyalty = fields.Boolean("Loyalty")
    loyalty_journal_id = fields.Many2one("account.journal","Loyalty Journal")
    today_sale_report = fields.Boolean("Today Sale Report")
    money_in_out = fields.Boolean("Money In/Out")
    money_in_out_receipt = fields.Boolean("Money In/Out Receipt")
    money_in_reason = fields.Text("Money In Reason")
    money_out_reason = fields.Text("Money Out Reason")
    enable_gift_card = fields.Boolean('Gift Card')
    gift_card_product_id = fields.Many2one('product.product',string="Gift Card Product")
    enable_journal_id = fields.Many2one('account.journal',string="Enable Journal")
    manual_card_number = fields.Boolean('Manual Card No.')
    default_exp_date = fields.Integer('Default Card Expire Months')
    msg_before_card_pay = fields.Boolean('Confirm Message Before Card Payment')
    open_pricelist_popup = fields.Char('Shortcut Key')
    enable_gift_voucher = fields.Boolean('Gift Voucher')
    gift_voucher_journal_id = fields.Many2one("account.journal", string="Gift Voucher Journal")
    enable_print_last_receipt = fields.Boolean("Print Last Receipt")
    pos_promotion = fields.Boolean("Promotion")
    show_qty = fields.Boolean(string='Display Stock')
    restrict_order = fields.Boolean(string='Restrict Order When Out Of Stock')
    prod_qty_limit = fields.Integer(string="Restrict When Product Qty Remains")
    custom_msg = fields.Char(string="Custom Message")
    enable_print_valid_days = fields.Boolean("Enable Print Product Return Valid days")
#     default_return_valid_days = fields.Integer("Default Return Valid Days")
    enable_card_charges = fields.Boolean("Enable Card Charges")
    payment_product_id = fields.Many2one('product.product',"Payment Charge Product")
#     Wallet Functionality
    enable_wallet = fields.Boolean('Enable Wallet')
    wallet_product = fields.Many2one('product.product', string="Wallet Product")
    send_order_kitchen = fields.Boolean("Send to kitchen")
    enable_modifiers = fields.Boolean("Modifiers")
#   Combo
    enable_combo = fields.Boolean('Enable Combo')
    edit_combo = fields.Boolean('Single Click for Edit Combo')
    hide_uom = fields.Boolean('Hide UOM')

# Order Reservation
#     enable_order_reservation = fields.Boolean('Enable Debit/Credit Management')
#     reserve_stock_location_id = fields.Many2one('stock.location','Reserve Stock Location')
#     cancellation_charges_type = fields.Selection([('fixed','Fixed'),('percentage', 'Percentage')], 'Cancellation Charges Type')
#     cancellation_charges = fields.Float('Cancellation Charges')
#     cancellation_charges_product_id = fields.Many2one('product.product','Cancellation Charges Product')

#     Credit Management
    prod_for_payment = fields.Many2one('product.product',string='Paid Amount Product',
                                    help="This is a dummy product used when a customer pays partially. This is a workaround to the fact that Odoo needs to have at least one product on the order to validate the transaction.")
    enable_credit = fields.Boolean('Credit Management')
    receipt_balance = fields.Boolean('Display Balance info in Receipt')
    print_ledger = fields.Boolean('Print Credit Statement')
    pos_journal_id = fields.Many2one('account.journal', string='Select Journal')

#     refund_amount_product_id = fields.Many2one('product.product','Refund Amount Product')
#     enable_pos_welcome_mail = fields.Boolean("Send Welcome Mail")
#     allow_reservation_with_no_amount = fields.Boolean("Allow Reservation With 0 Amount")

    enable_take_away = fields.Boolean("Domicilio")
    enable_merge_table = fields.Boolean("Merge Table")
    vertical_categories = fields.Boolean(string="Vertical Categories")
    auto_close = fields.Boolean(string="Auto Close")

# Customer Display
    customer_display = fields.Boolean("Customer Display")
    image_interval = fields.Integer("Image Interval", default=10)
    customer_display_details_ids = fields.One2many('customer.display','config_id', "Customer Display Details")
    enable_customer_rating = fields.Boolean("Customer Display Rating")
    set_customer = fields.Boolean("Select/Create Customer")

# Product Summary Report
    print_product_summary = fields.Boolean(string="Product Summary Report")
    no_of_copy_receipt = fields.Integer(string="No.of Copy Receipt", default=1)
    product_summary_month_date = fields.Boolean(string="Product - Current Month Date")
    signature = fields.Boolean(string="Signature")

# Order Summary Report
    enable_order_summary = fields.Boolean(string='Order Summary Report')
    order_summary_no_of_copies = fields.Integer(string="No. of Copy Receipt", default=1)
    order_summary_current_month = fields.Boolean(string="Current month")
    order_summary_signature = fields.Boolean(string="Order Signature")

# Payment_summary_report
    payment_summary = fields.Boolean(string="Payment Summary")
    current_month_date = fields.Boolean(string="Payment - Current Month Date")

# Print Audit Report
    print_audit_report = fields.Boolean("Print Audit Report")

# Out of Stock
    out_of_stock_detail = fields.Boolean(string="Out of Stock Detail")

    enable_int_trans_stock = fields.Boolean(string="Internal Stock Transfer")

# Sales Dashboard
    pos_dashboard = fields.Boolean(string="Sales Dashboard")
# Debit Feature
    enable_debit = fields.Boolean(string="Sales Debit")
# Take Money Out
    amount_limit = fields.Float(string="Amount Limit")
    authentication_user_ids = fields.Many2many('res.users','pos_config_money_out_auth_id',string="Manager Approval")
    generate_token = fields.Boolean(string="Generate Token")
    seperate_receipt = fields.Boolean(string="Seperate Receipt")

    multi_shop_id = fields.Many2one("pos.shop", string="Shop")
    header_info = fields.Selection([('company','Company'),('store','Shop')],string="Receipt Header Information",required=True,default="company")

    default_partner_id = fields.Many2one('res.partner',string="Default Customer")
    order_sync = fields.Boolean(string="Order Sync")

    table_reservation = fields.Boolean('Table Reservation')
    tabel_reservation_product_id = fields.Many2one('product.product', string="Table Reservation Product")
    table_reservation_charge = fields.Float(string="Table Reservation Charge")
    table_reservation_duration = fields.Integer(string="Default Reservation Duration")

    enable_change_pin = fields.Boolean(string="Change User Pin")
    restrict_chair = fields.Boolean(string="Restrict Chair")

    restaurant_floor_ids = fields.Many2many('restaurant.floor','pos_config_restaurant_floor_id',string='Floors',domain="[('shop_id','=',multi_shop_id)]")

    pos_type = fields.Selection([('drive_through_mode','Drive Through'),
                                 ('dine_in_mode','Comedor'),('online_mode','Rapido'),('take_away','Domicilio')])

    manager_auth_for_menu = fields.Boolean(string="Authentication For Menu Access")
    menu_bar_auth = fields.Many2many('res.users','pos_config_menu_bar_auth_id',string="Authorised Persons")
    mrp_operation_type = fields.Many2one('stock.picking.type',string="MRP Operation Type")


class RestaurantFloor(models.Model):
    _inherit = 'restaurant.floor'

    shop_id = fields.Many2one('pos.shop',string="Shop")


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    @api.model
    def get_html_report(self, id, report_name):
        report = self._get_report_from_name(report_name)
        document = report.render_qweb_html([id], data={})
        if document:
            return document
        return False

class pos_order(models.Model):
    _inherit = 'pos.order'

    is_postpaid = fields.Boolean(
        string='Es Postpago',
    )
    is_meal_plan = fields.Boolean(
        string='Es Meal Plan',
    )
    
    
    order_type = fields.Char(
    string="Tipo",
    default='Normal'
    )

    @api.model
    def make_payment_debit(self, order, session):
        orders = self.search([('session_id', 'ilike', order)])
        for order in orders:
            values = self.env['pos.make.payment'].with_context({'active_id': order.id, 'default_journal_id': 7,'default_amount': order.amount_total}).default_get(['journal_id', 'amount'])
            self.env['pos.make.payment'].with_context({'active_id': order.id,'ctx_is_postpaid': True}).sudo().create(values).check()

    
    def make_payment_postpago(self):
        active_ids = self.env.context.get('active_ids', [])
        postpaid_journal = self.env['account.journal'].sudo().search([('code', '=', 'POSCR'),('company_id', '=', self.env.user.company_id.id)],limit=1)
        
        if(postpaid_journal):
            pass
        else:
            raise Warning("Debe existir un diario con codigo corto POSCR para la compañia "+str(self.env.user.company_id.name))

        partner_id = False
        has_more_partners = False

        if(postpaid_journal):
            for active_id in active_ids:
                order = self.browse(active_id)
                order.sudo().update({'order_type':'Cŕedito'})
                #Is in tree view for all partners o a single partner
                if(partner_id and order.partner_id.id!=partner_id):
                    has_more_partners = True

                partner_id = order.partner_id.id
                
                if(order.state == "draft"):
                    try:    
                        values = self.env['pos.make.payment'].with_context({'active_id': order.id, 'default_journal_id': postpaid_journal.id,'default_amount': order.amount_total}).default_get(['journal_id', 'amount'])
                        self.env['pos.make.payment'].with_context({'active_id': order.id,'ctx_is_postpaid': True}).sudo().create(values).check()
                        if order.amount_total > 0:
                            vals = {
                                        'es_abono': False,
                                        'name': order.session_id.name,
                                        'payment_type': "inbound",
                                        'amount': order.amount_total,
                                        'payment_date': datetime.now().date(),
                                        'fecha_pago': datetime.now().date(),
                                        'journal_id': postpaid_journal.id,
                                        'payment_method_id': 1,
                                        'partner_type': 'customer',
                                        'partner_id': order.partner_id.id,
                                    }
                            result = self.env['account.payment'].with_context({'default_from_pos':'credit'}).create(vals)
                            result.post()

                    except Exception as e:
                        exc_traceback = sys.exc_info()
                        raise Warning(getattr(e, 'message', repr(e))+" ON LINE "+format(sys.exc_info()[-1].tb_lineno))
        
        account_invoice = self.env['account.invoice']
        account_invoice_line = self.env['account.invoice.line']
        inv_line = []
        origin = []
        for order in self:
            invoice_line_data = {}
            origin.append(order.name)
            for line in order.lines:
                invoice_line_data.update({
                    'name': 'line',
                    'account_id': order.partner_id.property_account_receivable_id.id,
                    'product_id': line.product_id.id,
                    'quantity': line.qty,
                    'price_unit': line.price_unit
                })
                inv_line.append(invoice_line_data)

        inv = account_invoice.create({
            'name': 'Factura de cliente',
            'origin': ", ".join(origin),
            'partner_id': order.partner_id.id,
            #'invoice_line_ids': [(0, 0, )]
        })

        vals = {
            'invoice_id': inv.id
        }
        for inv_lines in inv_line:
            vals.update(inv_lines)
            account_invoice_line.create(vals)
        
        if(has_more_partners):
            return {'name': _('Pedidos a Cŕedito'), 'view_type': 'form', 'view_mode': 'tree', 'view_id': self.env.ref('point_of_sale.view_pos_order_tree').id, 'res_model': 'pos.order', 'type': 'ir.actions.act_window', 'target': 'current','domain':[('is_postpaid','=',True)]}
        else:
            return {'name': _('Pedidos a Cŕedito'), 'view_type': 'form', 'view_mode': 'tree', 'view_id': self.env.ref('point_of_sale.view_pos_order_tree').id, 'res_model': 'pos.order', 'type': 'ir.actions.act_window', 'target': 'current','domain':[('is_postpaid','=',True),('partner_id','=',partner_id)]}

    

    @api.model
    def load_order_details(self, order_id):
        order_obj = self.browse(int(order_id))
        lines = []
        if order_obj:
            for each in order_obj.lines:
                line = self.load_order_line_details(each.id)
                if line:
                    lines.append(line[0])
        return lines

    @api.model
    def load_order_line_details(self, line_id):
        data = {}
        line_obj = self.env['pos.order.line'].search_read([('id','=',line_id)])
        if line_obj:
            order_obj = self.browse(line_obj[0].get('order_id')[0])
            table_str = ''
            if order_obj.table_ids:
                for table in order_obj.table_ids:
                    table_str += table.name + ','
            data['id'] = line_obj[0].get('id')
            data['product_id'] = line_obj[0].get('product_id')
            data['uom_id'] = self.env['product.product'].browse(line_obj[0].get('product_id')[0]).uom_id.name
            data['company_id'] = line_obj[0].get('company_id')
            data['qty'] = line_obj[0].get('qty')
            data['order_line_note'] = line_obj[0].get('line_note')
            data['order_id'] = line_obj[0].get('order_id')
            data['state'] = line_obj[0].get('state')
            data['pos_reference'] = order_obj.pos_reference
            data['tabel_id'] = [order_obj.table_id.id, order_obj.table_id.name] if order_obj.table_id else False
            data['floor_id'] = order_obj.table_id.floor_id.name if order_obj.table_id and order_obj.table_id.floor_id else False
            data['table_str'] = table_str
            data['order_note'] = order_obj.note or False
        return [data]

    @api.multi
    def check_order_delivery_type(self):
        if self.delivery_type == 'pending' and self.state == 'draft':
            action_id = self.env.ref('point_of_sale.action_pos_payment')
            return {
                'name': action_id.name,
                'type': action_id.type,
                'res_model': action_id.res_model,
                'view_type': action_id.view_type,
                'view_id': action_id.view_id.id,
                'view_mode': action_id.view_mode,
                'context': {'from_delivery': True},
                'target': 'new',
            }

        elif self.delivery_type == 'pending' and self.state == 'paid':
            self.write({'delivery_type': 'delivered'})
            return {'type': 'ir.actions.client', 'tag': 'reload'}

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        user_rec = self.env['res.users'].browse(self._uid)
        erp_manager_id = self.env['ir.model.data'].get_object_reference('base',
                                                                         'group_erp_manager')[1]
        if user_rec and erp_manager_id not in user_rec.groups_id.ids:
            if user_rec.shop_ids:
                args += ['|',('shop_id', 'in', user_rec.shop_ids.ids),('shop_id', '=', False)]
            res = super(pos_order, self).search(args=args, offset=offset, limit=limit, order=order, count=count)
        else:
             res = super(pos_order, self).search(args=args, offset=offset, limit=limit, order=order, count=count)
        return res

    @api.model
    def change_delivery_state(self, order_id, state):
        order = self.browse(order_id)
        if order:
            order.update({'delivery_type':state})
            return order.read()[0]

    @api.model
    def make_delivery_payment(self, order_id, journal_id):
        order = self.browse(order_id)
        if order:
            order.update({'delivery_type':'delivered'})
            values = self.env['pos.make.payment'].with_context({
                                                    'active_id': order.id,
                                                    'default_journal_id': journal_id,
                                                    'default_amount': order.amount_total
                                                }).default_get(['journal_id', 'amount'])
            self.env['pos.make.payment'].with_context({'active_id': order.id,'ctx_is_postpaid': True}).create(values).check()
            return order.read()[0]

    @api.model
    def get_dashboard_data(self):
        company_id = self.env['res.users'].browse([self._uid]).company_id.id
        res_pos_order = {'total_sales':0,'total_orders':0}
        active_sessions = self.env['pos.session'].search([('state','=','opened')]).ids
        closed_sessions = self.env['pos.session'].search([('stop_at', '>=', fields.Date.today().strftime('%m/%d/%Y') + " 00:00:00"),
                                                          ('stop_at', '<=', fields.Date.today().strftime('%m/%d/%Y') + " 23:59:59"),
                                                          ('state','in',['closing_control','closed'])]).ids
        res_pos_order['closed_sessions'] = len(closed_sessions)
        res_pos_order['active_sessions'] = len(active_sessions)
        pos_ids = self.search([('company_id', '=', company_id),
                                ('date_order', '>=', fields.Date.today().strftime('%m/%d/%Y') + " 00:00:00"),
                                ('date_order', '<=', fields.Date.today().strftime('%m/%d/%Y') + " 23:59:59"), ])
        if pos_ids:
            total_sales = 0
            existing_partner_sale = 0
            new_partner_sale = 0
            without_partner_sale = 0
            for pos_id in pos_ids:
                total_sales += pos_id.amount_total
                if pos_id.partner_id:
                    orders = self.search([('partner_id','=',pos_id.partner_id.id),
                                        ('company_id', '=', company_id),
                                        ('date_order', '>=', fields.Date.today().strftime('%m/%d/%Y') + " 00:00:00"),
                                        ('date_order', '<=', fields.Date.today().strftime('%m/%d/%Y') + " 23:59:59"),])
                    if orders and len(orders) > 1:
                        existing_partner_sale += pos_id.amount_total
                    else:
                        new_partner_sale += pos_id.amount_total
                else:
                    orders = self.search([('partner_id','=',False),
                                        ('company_id', '=', company_id),
                                        ('date_order', '>=', fields.Date.today().strftime('%m/%d/%Y') + " 00:00:00"),
                                        ('date_order', '<=', fields.Date.today().strftime('%m/%d/%Y') + " 23:59:59")])

                    if orders and len(orders) > 1:
                        without_partner_sale += pos_id.amount_total
            res_pos_order['client_based_sale'] = {'new_client_sale' : new_partner_sale,'existing_client_sale':existing_partner_sale,'without_client_sale':without_partner_sale}
            res_pos_order['total_sales'] = total_sales
            res_pos_order['total_orders'] = len(pos_ids)
            current_time_zone = self.env.user.tz or 'UTC'
#             orders = []
            if self.env.user.tz:
                tz = pytz.timezone(self.env.user.tz)
            else:
                tz = pytz.utc
            c_time = datetime.now(tz)
            hour_tz = int(str(c_time)[-5:][:2])
            min_tz = int(str(c_time)[-5:][3:])
            sign = str(c_time)[-6][:1]
            sdate = c_time.strftime("%Y-%m-%d 00:00:00")
            edate = c_time.strftime("%Y-%m-%d 23:59:59")
            if sign == '-':
                start_date = (datetime.strptime(sdate, '%Y-%m-%d %H:%M:%S') + timedelta(hours=hour_tz, minutes=min_tz)).strftime("%Y-%m-%d %H:%M:%S")
                end_date = (datetime.strptime(edate, '%Y-%m-%d %H:%M:%S') + timedelta(hours=hour_tz, minutes=min_tz)).strftime("%Y-%m-%d %H:%M:%S")
            if sign == '+':
                start_date = (datetime.strptime(sdate, '%Y-%m-%d %H:%M:%S') - timedelta(hours=hour_tz, minutes=min_tz)).strftime("%Y-%m-%d %H:%M:%S")
                end_date = (datetime.strptime(edate, '%Y-%m-%d %H:%M:%S') - timedelta(hours=hour_tz, minutes=min_tz)).strftime("%Y-%m-%d %H:%M:%S")
            self._cr.execute("""SELECT extract(hour from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') AS date_order_hour,
                                       SUM((pol.qty * pol.price_unit) * (100 - pol.discount) / 100) AS price_total
                            FROM pos_order_line AS pol
                            LEFT JOIN pos_order po ON (po.id=pol.order_id)
                            WHERE po.date_order >= '%s'
                              AND po.date_order <= '%s'
                            GROUP BY  extract(hour from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s');
                            """ % (current_time_zone, start_date, end_date, current_time_zone))
            result_data_hour = self._cr.dictfetchall()
            hour_lst = [hrs for hrs in range(0,24)]
            for each in result_data_hour:
                if each['date_order_hour'] != 23:
                    each['date_order_hour'] = [each['date_order_hour'],each['date_order_hour'] + 1]
                else:
                    each['date_order_hour'] = [each['date_order_hour'],0]
                hour_lst.remove(int(each['date_order_hour'][0]))
            for hrs in hour_lst:
                hr = []
                if hrs != 23:
                    hr += [hrs, hrs+1]
                else:
                    hr += [hrs, 0]
                result_data_hour.append({'date_order_hour': hr, 'price_total': 0.0})
            sorted_hour_data = sorted(result_data_hour, key=lambda l: l['date_order_hour'][0])
            res_pos_order['sales_based_on_hours'] = sorted_hour_data
            # this month data
        res_curr_month = self.pos_order_month_based(1)
        res_pos_order ['current_month'] = res_curr_month
#             Last 6 month data
        last_6_month_res = self.pos_order_month_based(12)
        res_pos_order ['last_6_month_res'] = last_6_month_res
        return res_pos_order

    def pos_order_month_based(self,month_count):
        tz = pytz.utc
        c_time = datetime.now(tz)
        hour_tz = int(str(c_time)[-5:][:2])
        min_tz = int(str(c_time)[-5:][3:])
        sign = str(c_time)[-6][:1]
        current_time_zone = self.env.user.tz or 'UTC'
        stdate = c_time.strftime("%Y-%m-01 00:00:00")
        eddate = (c_time + relativedelta(day=1, months=+month_count, days=-1)).strftime("%Y-%m-%d 23:59:59")
        # this month data 
        if sign == '-':
            mon_stdate = (datetime.strptime(stdate, '%Y-%m-%d %H:%M:%S') + timedelta(hours=hour_tz, minutes=min_tz)).strftime("%Y-%m-%d %H:%M:%S")
            mon_eddate = (datetime.strptime(eddate, '%Y-%m-%d %H:%M:%S') + timedelta(hours=hour_tz, minutes=min_tz)).strftime("%Y-%m-%d %H:%M:%S")
        if sign == '+':
            mon_stdate = (datetime.strptime(stdate, '%Y-%m-%d %H:%M:%S') - timedelta(hours=hour_tz, minutes=min_tz)).strftime("%Y-%m-%d %H:%M:%S")
            mon_eddate = (datetime.strptime(eddate, '%Y-%m-%d %H:%M:%S') - timedelta(hours=hour_tz, minutes=min_tz)).strftime("%Y-%m-%d %H:%M:%S")
        if month_count == 12:
            self._cr.execute("""SELECT extract(month from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') AS date_order_month,
                                   SUM((pol.qty * pol.price_unit) * (100 - pol.discount) / 100) AS price_total
                        FROM pos_order_line AS pol
                        LEFT JOIN pos_order po ON (po.id=pol.order_id)
                        WHERE po.date_order >= '%s'
                          AND po.date_order <= '%s'
                        GROUP BY extract(month from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s');
                        """ % (current_time_zone, mon_stdate, mon_eddate, current_time_zone))
        else:
            self._cr.execute("""SELECT extract(day from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') AS date_order_day,
                                        extract(month from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') AS date_order_month,
                                       SUM((pol.qty * pol.price_unit) * (100 - pol.discount) / 100) AS price_total
                            FROM pos_order_line AS pol
                            LEFT JOIN pos_order po ON (po.id=pol.order_id)
                            WHERE po.date_order >= '%s'
                              AND po.date_order <= '%s'
                            GROUP BY  extract(day from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s'),
                                extract(month from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s')
                                ORDER BY extract(day from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') DESC;
                            """ % (current_time_zone,current_time_zone, mon_stdate, mon_eddate, current_time_zone,current_time_zone,current_time_zone))
        result_this_month = self._cr.dictfetchall()
        return result_this_month

    @api.model
    def graph_date_on_canvas(self,start_date,end_date):
        data = {}
        company_id = self.env['res.users'].browse([self._uid]).company_id.id
        domain = [('company_id', '=', company_id)]
        if start_date:
            domain += [('date_order', '>=', start_date)]
        else:
            domain += [('date_order', '>=', str(fields.Date.today()) + " 00:00:00")]
        if end_date:
            domain += [('date_order', '<=', end_date)]
        else:
            domain += [('date_order', '<=', str(fields.Date.today()) + " 23:59:59")]
        pos_ids = self.search(domain)
        if pos_ids:
            self._cr.execute("""select aj.name, aj.id, sum(amount)
                                from account_bank_statement_line as absl,
                                     account_bank_statement as abs,
                                     account_journal as aj 
                                where absl.statement_id = abs.id
                                      and abs.journal_id = aj.id 
                                     and absl.pos_statement_id IN %s
                                group by aj.name, aj.id """ % "(%s)" % ','.join(map(str, pos_ids.ids)))
            data = self._cr.dictfetchall()
        total = 0.0
        for each in data:
           total += each['sum']
        for each in data:
           each['per'] = (each['sum'] * 100) / total
        return data

    @api.model
    def session_details_on_canvas(self):
        data = {}
        domain_active_session = []
        close_session_list = []
        active_session_list = []
        company_id = self.env['res.users'].browse([self._uid]).company_id.id
        domain = [('company_id', '=', company_id),
                  ('date_order', '>=', fields.Date.today().strftime('%m/%d/%Y') + " 00:00:00"),
                  ('date_order', '<=', fields.Date.today().strftime('%m/%d/%Y') + " 23:59:59")]
        domain_active_session += domain
        domain_active_session += [('state','=','paid')]
        domain += [('state','=','done')]
        active_pos_ids = self.search(domain_active_session)
        posted_pos_ids = self.search(domain)
        if active_pos_ids:
            self._cr.execute("""select aj.name, aj.id, sum(amount),abs.pos_session_id
                                from account_bank_statement_line as absl,
                                     account_bank_statement as abs,
                                     account_journal as aj 
                                where absl.statement_id = abs.id
                                      and abs.journal_id = aj.id 
                                     and absl.pos_statement_id IN %s
                                group by aj.name, abs.pos_session_id, aj.id """ % "(%s)" % ','.join(map(str, active_pos_ids.ids)))
            active_session_data = self._cr.dictfetchall()
            session_group = {}
            sort_group = sorted(active_session_data, key=itemgetter('pos_session_id'))
            for key, value in itertools.groupby(sort_group, key=itemgetter('pos_session_id')):
                if key not in session_group:
                    session_group.update({key:[x for x in value]})
                else:
                    session_group[key] = [x for x in value]
            for k, v in session_group.items():
                total_sum = 0
                for each in v:
                    total_sum += float(each['sum'])
                active_session_list.append({'pos_session_id' : self.env['pos.session'].browse(k).read(), 'sum' : total_sum})
        if posted_pos_ids:
            self._cr.execute("""select aj.name, aj.id, sum(amount),abs.pos_session_id
                                from account_bank_statement_line as absl,
                                     account_bank_statement as abs,
                                     account_journal as aj 
                                where absl.statement_id = abs.id
                                      and abs.journal_id = aj.id 
                                     and absl.pos_statement_id IN %s
                                group by aj.name, abs.pos_session_id, aj.id """ % "(%s)" % ','.join(map(str, posted_pos_ids.ids)))

            posted_session_data = self._cr.dictfetchall()
            session_group = {}
            sort_group = sorted(posted_session_data, key=itemgetter('pos_session_id'))
            for key, value in itertools.groupby(sort_group, key=itemgetter('pos_session_id')):
                if key not in session_group:
                    session_group.update({key:[x for x in value]})
                else:
                    session_group[key] = [x for x in value]
            for k, v in session_group.items():
                total_sum = 0
                for each in v:
                    total_sum += float(each['sum'])
                close_session_list.append({'pos_session_id' : self.env['pos.session'].browse(k).read(), 'sum' : total_sum})
        return {'close_session': close_session_list, 'active_session': active_session_list}

    @api.model
    def graph_best_product(self,start_date,end_date):
        data = {}
        company_id = self.env['res.users'].browse([self._uid]).company_id.id
        domain = [('company_id', '=', company_id)]
        if start_date:
            domain += [('date_order', '>=', start_date)]
        else:
            domain += [('date_order', '>=', fields.Date.today().strftime('%m/%d/%Y') + " 00:00:00")]
        if end_date:
            domain += [('date_order', '<=', end_date)]
        else:
            domain += [('date_order', '<=', fields.Date.today().strftime('%m/%d/%Y') + " 23:59:59")]
        pos_ids = self.search(domain)
        if pos_ids:
            order_ids = []
            for pos_id in pos_ids:
                order_ids.append(pos_id.id)
            self._cr.execute("""
                SELECT pt.name, sum(psl.qty), SUM((psl.qty * psl.price_unit) * (100 - psl.discount) / 100) AS price_total FROM pos_order_line AS psl
                JOIN pos_order AS po ON (po.id = psl.order_id)
                JOIN product_product AS pp ON (psl.product_id = pp.id)
                JOIN product_template AS pt ON (pt.id = pp.product_tmpl_id)
                where po.id IN %s
                GROUP BY pt.name
                ORDER BY sum(psl.qty) DESC limit 50;
                """ % "(%s)" % ','.join(map(str, pos_ids.ids)))
            data = self._cr.dictfetchall()
        return data

    @api.model
    def orders_by_salesperson(self,start_date,end_date):
        data = {}
        company_id = self.env['res.users'].browse([self._uid]).company_id.id
        domain = [('company_id', '=', company_id)]
        if start_date:
            domain += [('date_order', '>=', start_date)]
        else:
            domain += [('date_order', '>=', fields.Date.today().strftime('%m/%d/%Y') + " 00:00:00")]
        if end_date:
            domain += [('date_order', '<=', end_date)]
        else:
            domain += [('date_order', '<=', fields.Date.today().strftime('%m/%d/%Y') + " 23:59:59")]
        pos_ids = self.search(domain)
        if pos_ids:
            order_ids = []
            for pos_id in pos_ids:
                order_ids.append(pos_id.id)
            self._cr.execute("""
                SELECT po.user_id, count(DISTINCT(po.id)) As total_orders, SUM((psl.qty * psl.price_unit) * (100 - psl.discount) / 100) AS price_total FROM pos_order_line AS psl
                JOIN pos_order AS po ON (po.id = psl.order_id)
                where po.id IN %s
                GROUP BY po.user_id
                ORDER BY count(DISTINCT(po.id)) DESC;
                """ % "(%s)" % ','.join(map(str, pos_ids.ids)))
            data = self._cr.dictfetchall()
        return data


    @api.model
    def payment_summary_report(self, vals):
        if vals:
            journals_detail = {}
            salesmen_detail = {}
            summary_data = {}
            order_detail = self.env['pos.order'].search([('date_order', '>=', vals.get('start_date')),
                                                         ('date_order', '<=', vals.get('end_date'))
                                                         ])
            if 'journals' in vals.get('summary'):
                if (order_detail):
                    for each_order in order_detail:
                        order_date = each_order.date_order
                        date1 = order_date
                        month_year = date1.strftime("%B-%Y")
                        if not month_year in journals_detail:
                            journals_detail[month_year] = {}
                            for payment_line in each_order.statement_ids:
                                if payment_line.statement_id.journal_id.name in journals_detail[month_year]:
                                    payment = journals_detail[month_year][payment_line.statement_id.journal_id.name]
                                    payment += payment_line.amount
                                else:
                                    payment = payment_line.amount
                                journals_detail[month_year][payment_line.statement_id.journal_id.name] = float(
                                    format(payment, '2f'))
                        else:
                            for payment_line in each_order.statement_ids:
                                if payment_line.statement_id.journal_id.name in journals_detail[month_year]:
                                    payment = journals_detail[month_year][payment_line.statement_id.journal_id.name]
                                    payment += payment_line.amount
                                else:
                                    payment = payment_line.amount
                                journals_detail[month_year][payment_line.statement_id.journal_id.name] = float(
                                    format(payment, '2f'))
                    for journal in journals_detail.values():
                        for i in journal:
                            if i in summary_data:
                                total = journal[i] + summary_data[i]
                            else:
                                total = journal[i]
                            summary_data[i] = float(format(total, '2f'))

            if 'sales_person' in vals.get('summary'):
                if (order_detail):
                    for each_order in order_detail:
                        order_date = each_order.date_order
                        date1 = order_date
                        month_year = date1.strftime("%B-%Y")
                        if each_order.user_id.name not in salesmen_detail:
                            salesmen_detail[each_order.user_id.name] = {}
                            if not month_year in salesmen_detail[each_order.user_id.name]:
                                salesmen_detail[each_order.user_id.name][month_year] = {}
                                for payment_line in each_order.statement_ids:
                                    if payment_line.statement_id.journal_id.name in \
                                            salesmen_detail[each_order.user_id.name][month_year]:
                                        payment = salesmen_detail[each_order.user_id.name][month_year][
                                            payment_line.statement_id.journal_id.name]
                                        payment += payment_line.amount
                                    else:
                                        payment = payment_line.amount
                                    salesmen_detail[each_order.user_id.name][month_year][
                                        payment_line.statement_id.journal_id.name] = float(
                                        format(payment, '2f'))
                        else:
                            if not month_year in salesmen_detail[each_order.user_id.name]:
                                salesmen_detail[each_order.user_id.name][month_year] = {}
                                for payment_line in each_order.statement_ids:
                                    if payment_line.statement_id.journal_id.name in \
                                            salesmen_detail[each_order.user_id.name][month_year]:
                                        payment = salesmen_detail[each_order.user_id.name][month_year][
                                            payment_line.statement_id.journal_id.name]
                                        payment += payment_line.amount
                                    else:
                                        payment = payment_line.amount
                                    salesmen_detail[each_order.user_id.name][month_year][
                                        payment_line.statement_id.journal_id.name] = float(
                                        format(payment, '2f'))
                            else:
                                for payment_line in each_order.statement_ids:
                                    if payment_line.statement_id.journal_id.name in \
                                            salesmen_detail[each_order.user_id.name][month_year]:
                                        payment = salesmen_detail[each_order.user_id.name][month_year][
                                            payment_line.statement_id.journal_id.name]
                                        payment += payment_line.amount
                                    else:
                                        payment = payment_line.amount
                                    salesmen_detail[each_order.user_id.name][month_year][
                                        payment_line.statement_id.journal_id.name] = float(
                                        format(payment, '2f'))
        return {
            'journal_details': journals_detail,
            'salesmen_details': salesmen_detail,
            'summary_data': summary_data
        }

    @api.model
    def product_summary_report(self, vals):
        if vals:
            product_summary_dict = {}
            category_summary_dict = {}
            payment_summary_dict = {}
            location_summary_dict = {}
            product_qty = 0
            location_qty = 0
            category_qty = 0
            payment = 0
            order_detail = self.env['pos.order'].search([('date_order', '>=', vals.get('start_date')),
                                                         ('date_order', '<=', vals.get('end_date'))
                                                         ])
            if ('product_summary' in vals.get('summary') or len(vals.get('summary')) == 0):
                if order_detail:
                    for each_order in order_detail:
                        for each_order_line in each_order.lines:
                            if each_order_line.product_id.name in product_summary_dict:
                                product_qty = product_summary_dict[each_order_line.product_id.name]
                                product_qty += each_order_line.qty
                            else:
                                product_qty = each_order_line.qty
                            product_summary_dict[each_order_line.product_id.name] = product_qty;

            if ('category_summary' in vals.get('summary') or len(vals.get('summary')) == 0):
                if order_detail:
                    for each_order in order_detail:
                        for each_order_line in each_order.lines:
                            if each_order_line.product_id.pos_categ_id.name in category_summary_dict:
                                category_qty = category_summary_dict[each_order_line.product_id.pos_categ_id.name]
                                category_qty += each_order_line.qty
                            else:
                                category_qty = each_order_line.qty
                            category_summary_dict[each_order_line.product_id.pos_categ_id.name] = category_qty;
                    if (False in category_summary_dict):
                        category_summary_dict['Others'] = category_summary_dict.pop(False);

            if ('payment_summary' in vals.get('summary') or len(vals.get('summary')) == 0):
                if order_detail:
                    for each_order in order_detail:
                        for payment_line in each_order.statement_ids:
                            if payment_line.statement_id.journal_id.name in payment_summary_dict:
                                payment = payment_summary_dict[payment_line.statement_id.journal_id.name]
                                payment += payment_line.amount
                            else:
                                payment = payment_line.amount
                            payment_summary_dict[payment_line.statement_id.journal_id.name] = float(
                                format(payment, '2f'));

            if ('location_summary' in vals.get('summary') or len(vals.get('summary')) == 0):
                location_list = []
                for each_order in order_detail:
                    location_summary_dict[each_order.picking_id.location_id.name] = {}
                for each_order in order_detail:
                    for each_order_line in each_order.lines:
                        if each_order_line.product_id.name in location_summary_dict[each_order.picking_id.location_id.name]:
                            location_qty = location_summary_dict[each_order.picking_id.location_id.name][
                                each_order_line.product_id.name]
                            location_qty += each_order_line.qty
                        else:
                            location_qty = each_order_line.qty
                        location_summary_dict[each_order.picking_id.location_id.name][
                            each_order_line.product_id.name] = location_qty
                location_list.append(location_summary_dict)

        return {
            'product_summary': product_summary_dict,
            'category_summary': category_summary_dict,
            'payment_summary': payment_summary_dict,
            'location_summary': location_summary_dict,
        }

    @api.model
    def order_summary_report(self, vals):
        order_list = {}
        order_list_sorted = []
        category_list = {}
        payment_list = {}
        if vals:
            if (vals['state'] == ''):
                if ('order_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                    orders = self.search(
                        [('date_order', '>=', vals.get('start_date')), ('date_order', '<=', vals.get('end_date'))])
                    for each_order in orders:
                        order_list[each_order.state] = []
                    for each_order in orders:
                        if each_order.state in order_list:
                            order_list[each_order.state].append({
                                'order_ref': each_order.name,
                                'order_date': each_order.date_order,
                                'total': float(format(each_order.amount_total, '.2f'))
                            })
                        else:
                            order_list.update({
                                each_order.state.append({
                                    'order_ref': each_order.name,
                                    'order_date': each_order.date_order,
                                    'total': float(format(each_order.amount_total, '.2f'))
                                })
                            })
                if ('category_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                    count = 0.00
                    amount = 0.00
                    orders = self.search(
                        [('date_order', '>=', vals.get('start_date')), ('date_order', '<=', vals.get('end_date'))])
                    for each_order in orders:
                        category_list[each_order.state] = {}
                    for each_order in orders:
                        for order_line in each_order.lines:
                            if each_order.state == 'paid':
                                if order_line.product_id.pos_categ_id.name in category_list[each_order.state]:
                                    count = category_list[each_order.state][order_line.product_id.pos_categ_id.name][0]
                                    amount = category_list[each_order.state][order_line.product_id.pos_categ_id.name][1]
                                    count += order_line.qty
                                    amount += order_line.price_subtotal_incl
                                else:
                                    count = order_line.qty
                                    amount = order_line.price_subtotal_incl
                            if each_order.state == 'done':
                                if order_line.product_id.pos_categ_id.name in category_list[each_order.state]:
                                    count = category_list[each_order.state][order_line.product_id.pos_categ_id.name][0]
                                    amount = category_list[each_order.state][order_line.product_id.pos_categ_id.name][1]
                                    count += order_line.qty
                                    amount += order_line.price_subtotal_incl
                                else:
                                    count = order_line.qty
                                    amount = order_line.price_subtotal_incl
                            if each_order.state == 'invoiced':
                                if order_line.product_id.pos_categ_id.name in category_list[each_order.state]:
                                    count = category_list[each_order.state][order_line.product_id.pos_categ_id.name][0]
                                    amount = category_list[each_order.state][order_line.product_id.pos_categ_id.name][1]
                                    count += order_line.qty
                                    amount += order_line.price_subtotal_incl
                                else:
                                    count = order_line.qty
                                    amount = order_line.price_subtotal_incl
                            category_list[each_order.state].update(
                                {order_line.product_id.pos_categ_id.name: [count, amount]})
                        if (False in category_list[each_order.state]):
                            category_list[each_order.state]['others'] = category_list[each_order.state].pop(False)

                if ('payment_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                    count = 0
                    orders = self.search(
                        [('date_order', '>=', vals.get('start_date')), ('date_order', '<=', vals.get('end_date'))])
                    for each_order in orders:
                        payment_list[each_order.state] = {}
                    for each_order in orders:
                        for payment_line in each_order.statement_ids:
                            if each_order.state == 'paid':
                                if payment_line.journal_id.name in payment_list[each_order.state]:
                                    count = payment_list[each_order.state][payment_line.journal_id.name]
                                    count += payment_line.amount
                                else:
                                    count = payment_line.amount
                            if each_order.state == 'done':
                                if payment_line.journal_id.name in payment_list[each_order.state]:
                                    count = payment_list[each_order.state][payment_line.journal_id.name]
                                    count += payment_line.amount
                                else:
                                    count = payment_line.amount
                            if each_order.state == 'invoiced':
                                if payment_line.journal_id.name in payment_list[each_order.state]:
                                    count = payment_list[each_order.state][payment_line.journal_id.name]
                                    count += payment_line.amount
                                else:
                                    count = payment_line.amount
                            payment_list[each_order.state].update(
                                {payment_line.journal_id.name: float(format(count, '.2f'))})
                return {'order_report': order_list, 'category_report': category_list, 'payment_report': payment_list,
                        'state': vals['state']}
            else:
                order_list = []
                if ('order_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                    orders = self.search(
                        [('date_order', '>=', vals.get('start_date')), ('date_order', '<=', vals.get('end_date')),
                         ('state', '=', vals.get('state'))])
                    for each_order in orders:
                        order_list.append({
                            'order_ref': each_order.name,
                            'order_date': each_order.date_order,
                            'total': float(format(each_order.amount_total, '.2f'))
                        })
                    order_list_sorted = sorted(order_list, key=itemgetter('order_ref'))

                if ('category_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                    count = 0.00
                    amount = 0.00
                    values = []
                    orders = self.search(
                        [('date_order', '>=', vals.get('start_date')), ('date_order', '<=', vals.get('end_date')),
                         ('state', '=', vals.get('state'))])
                    for each_order in orders:
                        for order_line in each_order.lines:
                            if order_line.product_id.pos_categ_id.name in category_list:
                                count = category_list[order_line.product_id.pos_categ_id.name][0]
                                amount = category_list[order_line.product_id.pos_categ_id.name][1]
                                count += order_line.qty
                                amount += order_line.price_subtotal_incl
                            else:
                                count = order_line.qty
                                amount = order_line.price_subtotal_incl
                            category_list.update({order_line.product_id.pos_categ_id.name: [count, amount]})
                    if (False in category_list):
                        category_list['others'] = category_list.pop(False)
                if ('payment_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                    count = 0
                    orders = self.search(
                        [('date_order', '>=', vals.get('start_date')), ('date_order', '<=', vals.get('end_date')),
                         ('state', '=', vals.get('state'))])
                    for each_order in orders:
                        for payment_line in each_order.statement_ids:
                            if payment_line.journal_id.name in payment_list:
                                count = payment_list[payment_line.journal_id.name]
                                count += payment_line.amount
                            else:
                                count = payment_line.amount
                            payment_list.update({payment_line.journal_id.name: float(format(count, '.2f'))})
            return {
                'order_report': order_list_sorted,
                'category_report': category_list,
                'payment_report': payment_list,
                'state': vals['state']
            }

    @api.one
    def get_timezone_date_order(self):
        if self.env.user.tz:
            tz = pytz.timezone(self.env.user.tz)
        else:
            tz = pytz.utc
        c_time = datetime.now(tz)
        hour_tz = int(str(c_time)[-5:][:2])
        min_tz = int(str(c_time)[-5:][3:])
        sign = str(c_time)[-6][:1]
        if sign == '+':
            date_order = self.date_order + timedelta(hours=hour_tz, minutes=min_tz)
        if sign == '-':
            date_order = self.date_order - timedelta(hours=hour_tz, minutes=min_tz)
        return date_order

    @api.multi
    def action_pos_order_paid(self):
        if self.is_delivery and not self.test_paid() and not self.picking_id:
            self.create_picking()
            return
        elif self.test_paid() and self.picking_id:
            self.write({'state': 'paid'})
            return True
        else:
            return super(pos_order, self).action_pos_order_paid()

    @api.model
    def create_from_ui(self, orders):
        #Credit module
        for each_data in orders:

            credit_details = each_data['data'].get('credit_detail')
            if credit_details:
                self.env['account.invoice'].get_credit_info(credit_details)
         # Keep only new orders
        submitted_references = [o['data']['name'] for o in orders]
        pos_order = self.search([('pos_reference', 'in', submitted_references),('state', '!=', 'draft')])
        existing_orders = pos_order.read(['pos_reference'])
        existing_references = set([o['pos_reference'] for o in existing_orders])
        orders_to_save = [o for o in orders if o['data']['name'] not in existing_references]
        order_ids = []
        for tmp_order in orders_to_save:
            to_invoice = tmp_order['to_invoice']
            order = tmp_order['data']
            if to_invoice:
                self._match_payment_to_invoice(order)
            pos_order = self._process_order(order)
            # create giftcard record
            if order.get('giftcard'):
                for create_details in order.get('giftcard'):
                    expiry_date = datetime.strptime(create_details.get('giftcard_expire_date'),'%Y/%m/%d').strftime('%Y-%m-%d')
                    vals = {
                        'card_no':create_details.get('giftcard_card_no'),
                        'card_value':create_details.get('giftcard_amount'),
                        'customer_id':create_details.get('giftcard_customer') or False,
                        'expire_date':expiry_date,
                        'card_type':create_details.get('card_type'),
                    }
                    self.env['aspl.gift.card'].create(vals)

            #  create redeem giftcard for use 
            if order.get('redeem') and pos_order:
                for redeem_details in order.get('redeem'):
                    redeem_vals = {
                            'pos_order_id':pos_order.id,
                            'order_date':pos_order.date_order,
                            'customer_id':redeem_details.get('card_customer_id') or False,
                            'card_id':redeem_details.get('redeem_card_no'),
                            'amount':redeem_details.get('redeem_card_amount'),
                           }
                    use_giftcard = self.env['aspl.gift.card.use'].create(redeem_vals)
                    if use_giftcard:
                        use_giftcard.card_id.write({ 'card_value': use_giftcard.card_id.card_value - use_giftcard.amount})

            #recharge giftcard
            if order.get('recharge'):
                for recharge_details in order.get('recharge'):
                    recharge_vals = {
                            'user_id':pos_order.user_id.id,
                            'recharge_date':pos_order.date_order,
                            'customer_id':recharge_details.get('card_customer_id') or False,
                            'card_id':recharge_details.get('recharge_card_id'),
                            'amount':recharge_details.get('recharge_card_amount'),
                           }
                    recharge_giftcard = self.env['aspl.gift.card.recharge'].create(recharge_vals)
                    if recharge_giftcard:
                        recharge_giftcard.card_id.write({ 'card_value': recharge_giftcard.card_id.card_value + recharge_giftcard.amount})
            if order.get('voucher'):
                for voucher in order.get('voucher'):
                    vals = {
                                'voucher_id':voucher.get('id') or False,
                                'voucher_code':voucher.get('voucher_code'),
                                'user_id':voucher.get('create_uid')[0],
                                'customer_id':order.get('partner_id'),
                                'order_name': pos_order.name,
                                'order_amount': pos_order.amount_total,
                                'voucher_amount': voucher.get('voucher_amount'),
                                'used_date': datetime.now(),
                            }
                    self.env['aspl.gift.voucher.redeem'].create(vals)
            if pos_order:
                pos_line_obj = self.env['pos.order.line']
                to_be_returned_items = {}
                for line in order.get('lines'):
                    if line[2].get('return_process'):
                        if line[2].get('product_id') in to_be_returned_items:
                            to_be_returned_items[line[2].get('product_id')] = to_be_returned_items[line[2].get('product_id')] + line[2].get('qty')
                        else:
                            to_be_returned_items.update({line[2].get('product_id'):line[2].get('qty')})
                for line in order.get('lines'):
                    for item_id in to_be_returned_items:
                        if line[2].get('return_process'):
                            for origin_line in self.browse([line[2].get('return_process')[0]]).lines:
                                if to_be_returned_items[item_id] == 0:
                                    continue
                                if origin_line.return_qty > 0 and item_id == origin_line.product_id.id:
                                    if (to_be_returned_items[item_id] * -1) >= origin_line.return_qty:
                                        ret_from_line_qty = 0
                                        to_be_returned_items[item_id] = to_be_returned_items[item_id] + origin_line.return_qty
                                    else:
                                        ret_from_line_qty = to_be_returned_items[item_id] + origin_line.return_qty
                                        to_be_returned_items[item_id] = 0
                                    origin_line.write({'return_qty': ret_from_line_qty});
            order_ids.append(pos_order.id)

            try:
                pos_order.action_pos_order_paid()
            except psycopg2.OperationalError:
                # do not hide transactional errors, the order(s) won't be saved!
                raise
            except Exception as e:
                _logger.error('Could not fully process the POS Order: %s', tools.ustr(e))

            if to_invoice:
                pos_order.action_pos_order_invoice()
                pos_order.invoice_id.sudo().action_invoice_open()
                pos_order.account_move = pos_order.invoice_id.move_id
        self.broadcast_order_data(True)
        return order_ids

    @api.model
    def _process_order(self,order):
        pos_line_obj = self.env['pos.order.line']
        draft_order_id = order.get('old_order_id')
#         if order.get('draft_order'):
#             if not draft_order_id:
#                 order.pop('draft_order')
#                 order_id = self.create(self._order_fields(order))
#                 return order_id
#             else:
#                 order_id = draft_order_id
#                 pos_line_ids = pos_line_obj.search([('order_id', '=', order_id)])
#                 if pos_line_ids:
#                     pos_line_obj.unlink(pos_line_ids)
#                 self.write([order_id],
#                            {'lines': order['lines'],
#                             'partner_id': order.get('partner_id')})
#                 return order_id

        if not order.get('draft_order') and draft_order_id:
            order_id = draft_order_id
            order_obj = self.browse(order_id)
            if order_obj:
                self.wallet_management(order, order_obj)
            pos_line_ids = pos_line_obj.search([('order_id', '=', order_id)])
            if pos_line_ids:
                self._cr.execute("DELETE FROM pos_order_line where id in (%s) " % ','.join(map(str, pos_line_ids._ids)))
            pos_order_lines = self._order_fields(order)
            temp = order.copy()
            temp.pop('lines',None);
            temp.pop('statement_ids', None)
            temp.pop('name', None)
            temp['lines'] = pos_order_lines.get('lines')
            temp.update({
                'date_order': order.get('creation_date')
            })
            order_obj.write(temp)
            for payments in order['statement_ids']:
                order_obj.add_payment(self._payment_fields(payments[2]))

            session = self.env['pos.session'].browse(order['pos_session_id'])
            if session.sequence_number <= order['sequence_number']:
                session.write({'sequence_number': order['sequence_number'] + 1})
                session.refresh()

            if not float_is_zero(order['amount_return'], self.env['decimal.precision'].precision_get('Account')):
                cash_journal = session.cash_journal_id
                if not cash_journal:
                    cash_journal_ids = session.statement_ids.filtered(lambda st: st.journal_id.type == 'cash')
                    if not len(cash_journal_ids):
                        raise Warning(_('error!'),
                                             _("No cash statement found for this session. Unable to record returned cash."))
                    cash_journal = cash_journal_ids[0].journal_id
                order_obj.add_payment({
                    'amount': -order['amount_return'],
                    'payment_date': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'payment_name': _('return'),
                    'journal': cash_journal.id,
                })
            return order_obj
        if not order.get('draft_order') and not draft_order_id:
            res = super(pos_order, self)._process_order(order)
            if res:
                self.wallet_management(order,res)
            if res.session_id.config_id.enable_pos_loyalty and res.partner_id:
                loyalty_settings = self.env['loyalty.config.settings'].load_loyalty_config_settings()
                if loyalty_settings and loyalty_settings[0]:
                    if loyalty_settings[0].get('points_based_on') and order.get('loyalty_earned_point'):
                        point_vals = {
                            'pos_order_id': res.id,
                            'partner_id': res.partner_id.id,
                            'points': order.get('loyalty_earned_point'),
                            'amount_total': (float(order.get('loyalty_earned_point')) * loyalty_settings[0].get('to_amount')) / loyalty_settings[0].get('points')
                        }
                        loyalty = self.env['loyalty.point'].create(point_vals)
                        if loyalty and res.partner_id.send_loyalty_mail:
                            try:
                                template_id = self.env['ir.model.data'].get_object_reference('flexibite_com_advance', 'email_template_pos_loyalty')
                                template_obj = self.env['mail.template'].browse(template_id[1])
                                template_obj.send_mail(loyalty.id,force_send=True, raise_exception=True)
                            except Exception as e:
                                _logger.error('Unable to send email for order %s',e)
                    if order.get('loyalty_redeemed_point'):
                        redeemed_vals = {
                            'redeemed_pos_order_id': res.id,
                            'partner_id': res.partner_id.id,
                            'redeemed_amount_total': self._calculate_amount_total_by_points(loyalty_settings, order.get('loyalty_redeemed_point')),
                            'redeemed_point': order.get('loyalty_redeemed_point'),
                        }
                        self.env['loyalty.point.redeem'].create(redeemed_vals)
            if order.get('customer_email') and res:
                try:
                    template_id = self.env['ir.model.data'].get_object_reference('flexibite_com_advance', 'email_template_pos_ereceipt')
                    template_obj = self.env['mail.template'].browse(template_id[1])
                    template_obj.send_mail(res.id,force_send=True, raise_exception=True)
                except Exception as e:
                    _logger.error('Unable to send email for order %s',e)
            if res and order.get('increment_number') and res.session_id.config_id.generate_token:
                res.session_id.update({'increment_number':order.get('increment_number')})
            if res.rest_table_reservation_id:
                table_record = self.env['restaurant.table.reservation'].search([('id','=',res.rest_table_reservation_id.id)])
                if table_record:
                    table_record.state = 'done';
            return res

    @api.model
    def broadcast_order_data(self, new_order):
        notifications = []
        vals = {}
        SQL = """
                select DISTINCT order_id from pos_order_line where state not in ('cancel','done')
                and create_date >='%s' and company_id = %s
         """%(str(date.today()) + ' 00:00:00', self.env.user.company_id.id)
        self._cr.execute(SQL)
        pos_order = self._cr.dictfetchall()
#         pos_order = self.search([('lines.state', 'not in', ['cancel', 'done']),('create_date','>=', str(date.today()) + ' 00:00:00')])
        pos_order_id_list = []
        pos_orders = []
        if pos_order:
            for order in pos_order:
                pos_order_id_list.append(order.get('order_id'))
            pos_orders = self.browse(pos_order_id_list)
        screen_table_data = []
        for order in pos_orders:
            order_line_list = []
            est_ordertime = 0
            for line in order.lines:
                combo_data = False
                est_ordertime += line.product_id.make_time
                if line.product_id.send_to_kitchen and not line.is_combo_line:
                    modifier_list = []
                    if line and not line.modifier:
                            modifier_line_ids = self.env['modifier.order.line'].search([('line_id','=',line.id)])
                            for modifier_line_id in modifier_line_ids:
                                modifier_list.append({
                                    'name':modifier_line_id.name,
                                    'qty': modifier_line_id.qty
                                })
                    if line.is_main_combo_product:
                        combo_data = ast.literal_eval(line.tech_combo_data) if line and line.tech_combo_data else False
                    order_line = {
                        'id': line.id,
                        'name': line.product_id.display_name,
                        'qty': line.qty,
                        'table': line.order_id.table_id.name,
                        'floor': line.order_id.table_id.floor_id.name,
    #                     'time': self.get_timezone_date(line),
                        'time': self.get_time(line.create_date),
                        'state': line.state,
                        'note': line.line_note,
                        'categ_id': line.product_id.product_tmpl_id.pos_categ_id.id,
                        'order': line.order_id.id,
                        'pos_cid': line.pos_cid,
                        'user': line.create_uid.id,
#                         'route_id': line.product_id.product_tmpl_id.route_ids.active,
                        'route_id':False,
                        'modifier_list':modifier_list,
                        'modifier':line.modifier,
                        'is_takeaway':line.is_takeaway,
                        'is_deliver': line.deliver,
                        'priority':line.priority,
                        'combo_data':combo_data,
                    }
                    order_line_list.append(order_line)
            date_order = str(order.date_order)
            tables = ''
            if order and order.table_ids:
                restaurant_tables = self.env['restaurant.table'].search_read([('id','in',order.table_ids.ids)], ['name'])
                if restaurant_tables:
                    for table in restaurant_tables:
                        tables += table.get('name') + ', '
            order_dict = {
                'order_id': order.id,
                'order_name': order.name,
#                 'order_time': date_order.split(" ")[1],
                'order_time': self.get_time(order.create_date),
                'table': tables[:-2] if tables else '',
                'floor': order.table_id.floor_id.name,
                'customer': order.partner_id.name,
                'order_lines': order_line_list,
                'total': order.amount_total,
                'note': order.note,
                'increment_number':order.increment_number if int(order.increment_number) > 0 else 0,
                'est_ordertime':est_ordertime,
                'user_id':order.user_id.id,
            }
            settings_kitchen_screen_timer = self.env['ir.config_parameter'].sudo().search([('key', '=', 'kitchen_screen_timer')])
            if settings_kitchen_screen_timer and settings_kitchen_screen_timer.value:
                order_dict['est_ordertime'] = est_ordertime
                order_dict['stop_timer'] = False
            else:
                order_dict['est_ordertime'] = 0
                order_dict['stop_timer'] = True
            screen_table_data.append(order_dict)
        kitchen_group_data = {}
        sort_group = sorted(screen_table_data, key=itemgetter('user_id'))
        for key, value in itertools.groupby(sort_group, key=itemgetter('user_id')):
            if key not in kitchen_group_data:
                kitchen_group_data.update({key:[x for x in value]})
            else:
                kitchen_group_data[key] = [x for x in value]
        for user_id in kitchen_group_data:
            user = self.env['res.users'].browse(user_id)
            if user and user.cook_user_ids:
                for cook_user_id in user.cook_user_ids:
                   
                    if 'orders' not in vals:
                        vals['orders'] = []
                    for itm in kitchen_group_data[user_id]:
                        if itm not in vals['orders']:
                            vals['orders'].append(itm)

                    if new_order:
                        vals['new_order'] = new_order
                    notifications.append(((self._cr.dbname, 'pos.order.line', cook_user_id.id), {'screen_display_data': vals}))
            if user and user.user_role == 'cook_manager':
                vals = {
                    "orders": kitchen_group_data[user_id],
                }
                notifications.append(((self._cr.dbname, 'pos.order.line', user.id), {'screen_display_data': vals}))
        if notifications:
            self.env['bus.bus'].sendmany(notifications)
        return True

    @api.multi
    def get_time(self, date_time):
        if self.env.user.tz:
            tz = pytz.timezone(self.env.user.tz)
        else:
            tz = pytz.utc
        c_time = datetime.now(tz)
        hour_tz = int(str(c_time)[-5:][:2])
        min_tz = int(str(c_time)[-5:][3:])
        sign = str(c_time)[-6][:1]
        if sign == '-':
            date = date_time - timedelta(hours=hour_tz, minutes=min_tz)
        if sign == '+':
            date = date_time + timedelta(hours=hour_tz, minutes=min_tz)
        return str(date.strftime("%Y-%m-%d %H:%M:%S"))

    @api.multi
    def get_timezone_date(self, line):
        SQL = """SELECT create_date AT TIME ZONE 'GMT' as create_date  from pos_order_line where id = %d
                   """ % (line.id)
        self._cr.execute(SQL)
        data = self._cr.dictfetchall()
        time = data[0]['create_date']
        return str(time.hour)+ ':' + str(time.minute) + ':' + str(time.second)

    def wallet_management(self,order,res):
        if order.get('wallet_type'):
            if order.get('change_amount_for_wallet'):
                session_id = res.session_id
                cash_register_id = session_id.cash_register_id
                if cash_register_id:
                    cash_bocx_in_obj = self.env['cash.box.in'].create({
                        'name': 'Credit',
                        'amount': order.get('change_amount_for_wallet')
                    })
                    cash_bocx_in_obj._run(cash_register_id)
                vals = {
                    'customer_id': order.get('partner_id') or res.partner_id.id or False,
                    'type': order.get('wallet_type'),
                    'order_id': res.id,
                    'credit': order.get('change_amount_for_wallet'),
                    'cashier_id': order.get('user_id'),
                }
                self.env['wallet.management'].create(vals)
            if order.get('used_amount_from_wallet'):
                vals = {
                    'customer_id': order.get('partner_id') or res.partner_id.id or False,
                    'type': order.get('wallet_type'),
                    'order_id': res.id,
                    'debit': order.get('used_amount_from_wallet'),
                    'cashier_id': order.get('user_id'),
                }
                self.env['wallet.management'].create(vals)

    def _order_fields(self,ui_order):
        res = super(pos_order, self)._order_fields(ui_order)
        new_order_line = []
        process_line = partial(self.env['pos.order.line']._order_line_fields)
        order_lines = [process_line(l) for l in ui_order['lines']] if ui_order['lines'] else False
        if order_lines:
            for order_line in order_lines:
    #             new_order_line.append(order_line)
                if 'combo_ext_line_info' in order_line[2]:
                    order_line[2]['is_main_combo_product'] = True
                    own_pro_list = [process_line(l) for l in order_line[2]['combo_ext_line_info']] if order_line[2]['combo_ext_line_info'] else False
                    if own_pro_list:
                        for own in own_pro_list:
                            own[2]['price_subtotal'] = 0
                            own[2]['price_subtotal_incl'] = 0
                            own[2]['is_combo_line'] = True
                            own[2]['combo_product_id'] = order_line[2]['product_id']
                            own[2]['tax_ids'] = [(6, 0, [])]
                            new_order_line.append(own)
                if order_line[2].get('modifier') == True:
                    order_line[2]['price_subtotal'] = 0
                    order_line[2]['price_subtotal_incl'] = 0
                new_order_line.append(order_line)
        res.update({
            'is_debit': ui_order.get('is_debit') or False,
            'is_delivery' : ui_order.get('is_delivery') or False,
            'lines': new_order_line,
            'customer_email': ui_order.get('customer_email'),
            'note': ui_order.get('order_note') or False,
            'return_order':         ui_order.get('return_order', ''),
            'back_order':           ui_order.get('back_order', ''),
            'parent_return_order':  ui_order.get('parent_return_order', ''),
            'return_seq':           ui_order.get('return_seq', ''),
            'is_rounding':          ui_order.get('is_rounding') or False,
            'rounding_option':      ui_order.get('rounding_option') or False,
            'rounding':             ui_order.get('rounding') or False,
            'delivery_date':        ui_order.get('delivery_date') or False,
            'delivery_time':        ui_order.get('delivery_time') or False,
            'delivery_address':     ui_order.get('delivery_address') or False,
            'delivery_charge_amt':     ui_order.get('delivery_charge_amt') or False,
            'total_loyalty_earned_points': ui_order.get('loyalty_earned_point') or 0.00,
            'total_loyalty_earned_amount': ui_order.get('loyalty_earned_amount') or 0.00,
            'total_loyalty_redeem_points': ui_order.get('loyalty_redeemed_point') or 0.00,
            'total_loyalty_redeem_amount': ui_order.get('loyalty_redeemed_amount') or 0.00,
            'partial_pay': ui_order.get('partial_pay') or False,
            'table_ids': [(6, 0, ui_order.get('table_ids')  or [])],
            'rating': ui_order.get('rating'),
            'delivery_type': ui_order.get('delivery_type'),
            'delivery_user_id': ui_order.get('delivery_user_id'),
            'increment_number':ui_order.get('increment_number') or False,
            'shop_id': ui_order.get('shop_id') or False,
            'order_on_debit': ui_order.get('order_on_debit'),
            'pos_normal_receipt_html':ui_order.get('pos_normal_receipt_html'),
            'pos_xml_receipt_html':ui_order.get('pos_xml_receipt_html'),
            'salesman_id':ui_order.get('salesman_id') or False,
            'asst_cashier_id':ui_order.get('asst_cashier_id') or False,
            'table_reservation_details': ui_order.get('table_reservation_details') or False,
            'reservation_state':ui_order.get('reservation_state'),
            'rest_table_reservation_id':ui_order.get('rest_table_reservation_id'),
            'online_order_ref': ui_order.get('online_order_ref') or False,
            'return_cust_mobile' : ui_order.get('return_cust_mobile') or False,
            'reason_of_return': ui_order.get('reason_of_return') or False,
            'order_mode':ui_order.get('order_mode') or False,
        })
        return res

    @api.model
    def add_payment(self, data):
        """Create a new payment for the order"""
        if data['amount'] == 0.0:
            return
        return super(pos_order, self).add_payment(data)

    def create(self, values):
        order_id = super(pos_order, self).create(values)
        rounding_journal_id = order_id.session_id.config_id.rounding_journal_id
        if order_id.rounding != 0:
            if rounding_journal_id:
                order_id.add_payment({
                    'amount':order_id.rounding * -1,
                    'payment_date': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'payment_name': _('Rounding'),
                    'journal': rounding_journal_id.id,
                })
        if not order_id.user_id.user_role == 'cashier':
            notifications = []
            users = self.env['res.users'].search([])
            for user in users:
                if user.sales_persons:
                    for salesperson in user.sales_persons:
                        if salesperson.id == order_id.user_id.id:
                            session = self.env['pos.session'].search([('user_id','=',user.id)], limit=1)
                            if session:
                                notifications.append(
                                    [(self._cr.dbname, 'sale.note', user.id), {'new_pos_order': order_id.read()}])
            self.env['bus.bus'].sendmany(notifications)
        if values.get('delivery_type') or values.get('delivery_user_id') or values.get('delivery_address') or \
        values.get('delivery_date') or values.get('delivery_time'):
            delivery_notif = []
            pos_session_ids = self.env['pos.session'].search([('state', '=', 'opened')])
            for session in pos_session_ids:
                delivery_notif.append([(self._cr.dbname, 'lock.data', session.user_id.id),
                                          {'delivery_pos_order':order_id.read()}])
            self.env['bus.bus'].sendmany(delivery_notif)
        if values and values.get('reservation_state'):
            for key in values.get('reservation_state'):
                self.env['restaurant.table.reservation'].browse(key).write({'state':'done'})
        if values and values.get('table_reservation_details'):
            end_date_time = (datetime.strptime(values.get('table_reservation_details').get('tbl_reserve_datetime'), '%Y-%m-%d %H:%M') + timedelta(hours=int(values.get('table_reservation_details').get('duration')))).strftime("%Y-%m-%d %H:%M:%S")
            restaurant_id =  self.env['restaurant.table.reservation'].create({
                'order_id': order_id.id,
                'tbl_reserve_datetime':values.get('table_reservation_details').get('tbl_reserve_datetime'),
                'table_reserve_amount': values.get('table_reservation_details').get('table_reserve_amount'),
                'table_ids': [(6, 0, values.get('table_reservation_details').get('table_ids'))],
                'seats': values.get('table_reservation_details').get('seats'),
                'partner_id': values.get('table_reservation_details').get('partner_id'),
                'table_reserve_end_datetime':end_date_time,
                'state': values.get('table_reservation_details').get('state'),
            })
        return order_id

#     @api.multi
#     def unlink(self):
#         notifications = []
#         notify_users = []
#         order_user = self.env['res.users'].browse(self.user_id.id)
#         if self.salesman_id:
#             if self._uid == self.salesman_id.id:
#                 users = self.env['res.users'].search([])
#                 for user in users:
#                     if user.sales_persons:
#                         for salesperson in user.sales_persons:
#                             if salesperson.id == order_id.user_id.id:
#                                 session = self.env['pos.session'].search([('user_id','=',user.id)], limit=1)
#                                 if session:
#                                     notify_users.append(session.user_id.id)
#             else:
#                 notify_users.append(self.salesman_id.id)
#             for user in notify_users:
#                 notifications.append([(self._cr.dbname, 'sale.note', user),
#                                           {'cancelled_sale_note': self.read()}])
#             self.env['bus.bus'].sendmany(notifications)
#         return super(pos_order, self).unlink()

    @api.multi
    def write(self, vals):
        res = super(pos_order, self).write(vals)
        notifications = []
        notify_users = []
        order_id = self.browse(vals.get('old_order_id'))
        order_user = self.env['res.users'].browse(vals.get('user_id'))
        users = self.env['res.users'].search([])
        for user in users:
            if user.sales_persons:
                if user.id == order_user.id:
                    session = self.env['pos.session'].search([('user_id','=',user.id)], limit=1)
                    if session:
                        notify_users.append(session.user_id.id)

        for user in notify_users:
            notifications.append(((self._cr.dbname, 'sale.note', user),
                                      ('new_pos_order', order_id.read())))
        if vals and order_id and vals.get('amount_paid') >= order_id.amount_total:
            notifications.append(((self._cr.dbname, 'sale.note', order_id.asst_cashier_id.id),
                                      {'destroy_pos_order': order_id.pos_reference}))
        self.env['bus.bus'].sendmany(notifications)

        if vals.get('delivery_type') or vals.get('delivery_user_id') or vals.get('delivery_address') or \
        vals.get('delivery_date') or vals.get('delivery_time'):
            delivery_notif = []
            pos_session_ids = self.env['pos.session'].search([('state', '=', 'opened')])
            for session in pos_session_ids:
                delivery_notif.append([(self._cr.dbname, 'lock.data', session.user_id.id),
                                          {'delivery_pos_order':self.read()}])
            self.env['bus.bus'].sendmany(delivery_notif)

        return res

    def _calculate_amount_total_by_points(self, loyalty_config, points):
        return (float(points) * loyalty_config[0].get('to_amount')) / (loyalty_config[0].get('points') or 1)

    def get_point_from_category(self, categ_id):
        if categ_id.loyalty_point:
            return categ_id.loyalty_point
        elif categ_id.parent_id:
            self.get_point_from_category(categ_id.parent_id)
        return False

    def _calculate_loyalty_points_by_order(self, loyalty_config):
        if loyalty_config.point_calculation:
            earned_points = self.amount_total * loyalty_config.point_calculation / 100
            amount_total = (earned_points * loyalty_config.to_amount) / loyalty_config.points
            return {
                'points': earned_points,
                'amount_total': amount_total
            }
        return False

    @api.multi
    def refund(self):
        res = super(pos_order, self).refund()
        LoyaltyPoints = self.env['loyalty.point']
        refund_order_id = self.browse(res.get('res_id'))
        if refund_order_id:
            LoyaltyPoints.create({
                'pos_order_id': refund_order_id.id,
                'partner_id': self.partner_id.id,
                'points': refund_order_id.total_loyalty_redeem_points,
                'amount_total': refund_order_id.total_loyalty_redeem_amount,

            })
            LoyaltyPoints.create({
                'pos_order_id': refund_order_id.id,
                'partner_id': self.partner_id.id,
                'points': refund_order_id.total_loyalty_earned_points * -1,
                'amount_total': refund_order_id.total_loyalty_earned_amount * -1,

            })
            refund_order_id.write({
                'total_loyalty_earned_points': refund_order_id.total_loyalty_earned_points * -1,
                'total_loyalty_earned_amount': refund_order_id.total_loyalty_earned_amount * -1,
                'total_loyalty_redeem_points': 0.00,
                'total_loyalty_redeem_amount': 0.00,
            })
        return res

# POS Reorder start here
    @api.model
    def ac_pos_search_read(self, domain):
        domain = domain.get('domain')
        search_vals = self.search_read(domain)
        user_id = self.env['res.users'].browse(self._uid)
        tz = False
        result = []
        if self._context and self._context.get('tz'):
            tz = timezone(self._context.get('tz'))
        elif user_id and user_id.tz:
            tz = timezone(user_id.tz)
        if tz:
            c_time = datetime.now(tz)
            hour_tz = int(str(c_time)[-5:][:2])
            min_tz = int(str(c_time)[-5:][3:])
            sign = str(c_time)[-6][:1]
            for val in search_vals:
                if sign == '-':
                    val.update({
                        'date_order':(val.get('date_order') - timedelta(hours=hour_tz, minutes=min_tz)).strftime('%Y-%m-%d %H:%M:%S')
                    })
                elif sign == '+':
                    val.update({
                        'date_order':(val.get('date_order') + timedelta(hours=hour_tz, minutes=min_tz)).strftime('%Y-%m-%d %H:%M:%S')
                    })
                result.append(val)
            return result
        else:
            return search_vals
# POS Reorder end here

    @api.one
    def multi_picking(self):
        Picking = self.env['stock.picking']
        Move = self.env['stock.move']
        StockWarehouse = self.env['stock.warehouse']
        address = self.partner_id.address_get(['delivery']) or {}
        picking_type = self.picking_type_id
        order_picking = Picking
        return_picking = Picking
        return_pick_type = self.picking_type_id.return_picking_type_id or self.picking_type_id
        message = _("This transfer has been created from the point of sale session: <a href=# data-oe-model=pos.order data-oe-id=%d>%s</a>") % (self.id, self.name)
        if self.partner_id:
            destination_id = self.partner_id.property_stock_customer.id
        else:
            if (not picking_type) or (
                    not picking_type.default_location_dest_id):
                customerloc, supplierloc = StockWarehouse._get_partner_locations()
                destination_id = customerloc.id
            else:
                destination_id = picking_type.default_location_dest_id.id
        lst_picking = []
        location_ids = list(set([line.location_id.id for line in self.lines]))
        for loc_id in location_ids:
            picking_vals = {
                'origin': self.name,
                'partner_id': address.get('delivery', False),
                'date_done': self.date_order,
                'picking_type_id': picking_type.id,
                'company_id': self.company_id.id,
                'move_type': 'direct',
                'note': self.note or "",
                'location_id': loc_id,
                'location_dest_id': destination_id,
            }
            pos_qty = any(
                [x.qty > 0 for x in self.lines if x.product_id.type in ['product', 'consu']])
            if pos_qty:
                order_picking = Picking.create(picking_vals.copy())
                order_picking.message_post(body=message)
            neg_qty = any(
                [x.qty < 0 for x in self.lines if x.product_id.type in ['product', 'consu']])
            if neg_qty:
                return_vals = picking_vals.copy()
                return_vals.update({
                    'location_id': destination_id,
                    'location_dest_id': loc_id,
                    'picking_type_id': return_pick_type.id
                })
                return_picking = Picking.create(return_vals)
                return_picking.message_post(body=message)
            for line in self.lines.filtered(
                lambda l: l.product_id.type in [
                    'product',
                    'consu'] and l.location_id.id == loc_id and not float_is_zero(
                    l.qty,
                    precision_digits=l.product_id.uom_id.rounding)):
                Move.create({
                    'name': line.name,
                    'product_uom': line.product_id.uom_id.id,
                    'picking_id': order_picking.id if line.qty >= 0 else return_picking.id,
                    'picking_type_id': picking_type.id if line.qty >= 0 else return_pick_type.id,
                    'product_id': line.product_id.id,
                    'product_uom_qty': abs(line.qty),
                    'state': 'draft',
                    'location_id': loc_id if line.qty >= 0 else destination_id,
                    'location_dest_id': destination_id if line.qty >= 0 else loc_id,
                })
            if return_picking:
                self.write({'picking_ids': [(4, return_picking.id)]})
                self._force_picking_done(return_picking)
            if order_picking:
                self.write({'picking_ids': [(4, order_picking.id)]})
                self._force_picking_done(order_picking)
        return True

    @api.multi
    @api.depends('amount_total', 'amount_paid')
    def _compute_amount_due(self):
        for each in self:
            each.amount_due = each.amount_total - each.amount_paid

    @api.model
    def graph_data(self, from_date, to_date, category, limit, session_id, current_session_report):
        if from_date and not to_date:
            if from_date.split(' ')[0] and len(from_date.split(' ')) > 1:
                to_date = from_date.split(' ')[0]+" 23:59:59"
        elif to_date and not from_date:
            if to_date.split(' ')[0] and len(to_date.split(' ')) > 1:
                from_date = to_date.split(' ')[0]+" 00:00:00"
        try:
            if from_date and to_date:
                if category == 'top_customer':
                    if current_session_report:
                        order_ids = self.env['pos.order'].search([('partner_id', '!=', False),
                                                                ('date_order', '>=', from_date),
                                                                ('date_order', '<=', to_date),
                                                                ('session_id','=',session_id)], order='date_order desc')
                    else:
                        order_ids = self.env['pos.order'].search([('partner_id', '!=', False),
                                                                ('date_order', '>=', from_date),
                                                                ('date_order', '<=', to_date)], order='date_order desc')
                    result = []
                    record = {}
                    if order_ids:
                        for each_order in order_ids:
                            if each_order.partner_id in record:
                                record.update({each_order.partner_id: record.get(each_order.partner_id) + each_order.amount_total})
                            else:
                                record.update({each_order.partner_id: each_order.amount_total})
                    if record:
                        result = [(k.name, v) for k, v in record.items()]
                        result = sorted(result, key=lambda x: x[1], reverse=True)
                    if limit == 'ALL':
                        return result
                    return result[:int(limit)]
                if category == 'top_products':
                    if current_session_report:
                        self._cr.execute("""
                            SELECT pt.name, sum(psl.qty), pp.id FROM pos_order_line AS psl
                            JOIN pos_order AS po ON (po.id = psl.order_id)
                            JOIN product_product AS pp ON (psl.product_id = pp.id)
                            JOIN product_template AS pt ON (pt.id = pp.product_tmpl_id)
                            WHERE po.date_order >= '%s'
                            AND po.date_order <= '%s'
                            AND po.session_id = '%s'
                            GROUP BY pt.name, pp.id
                            ORDER BY sum(psl.qty) DESC limit %s;
                            """%((from_date, to_date, session_id, limit)))
                        return self._cr.fetchall()
                    else:
                        self._cr.execute("""
                            SELECT pt.name, sum(psl.qty), pp.id FROM pos_order_line AS psl
                            JOIN pos_order AS po ON (po.id = psl.order_id)
                            JOIN product_product AS pp ON (psl.product_id = pp.id)
                            JOIN product_template AS pt ON (pt.id = pp.product_tmpl_id)
                            WHERE po.date_order >= '%s'
                            AND po.date_order <= '%s'
                            GROUP BY pt.name, pp.id
                            ORDER BY sum(psl.qty) DESC limit %s;
                            """%((from_date, to_date, limit)))
                        return self._cr.fetchall()
                if category == 'cashiers':
                    if current_session_report:
                        self._cr.execute("""
                            SELECT pc.name, SUM(absl.amount) FROM account_bank_statement_line absl
                            JOIN account_journal aj ON absl.journal_id = aj.id
                            JOIN pos_session as ps ON ps.name = absl.ref
                            JOIN pos_config as pc ON pc.id = ps.config_id
                            WHERE absl.create_date >= '%s' AND absl.create_date <= '%s'
                            AND ps.id = '%s'
                            GROUP BY pc.name
                            limit %s
                            """%((from_date, to_date, session_id, limit)))
                        return self._cr.fetchall()
                    else:
                        SQL1 = """SELECT pc.name,sum(abs.balance_end) from 
                            pos_session ps,account_bank_statement abs,pos_config pc
                            WHERE abs.pos_session_id = ps.id 
                            AND pc.id = ps.config_id
                            AND ps.start_at AT TIME ZONE 'GMT' >= '%s' 
                            and ps.start_at AT TIME ZONE 'GMT' <= '%s'
                            GROUP BY pc.name;
                            """ % ((from_date, to_date))
                        self._cr.execute(SQL1)
                        find_session = self._cr.fetchall()
                        return find_session
                if category == 'sales_by_location':
                    if current_session_report:
                        self._cr.execute("""
                            SELECT (loc1.name || '/' || loc.name) as name, sum(psl.price_unit) FROM pos_order_line AS psl
                            JOIN pos_order AS po ON (po.id = psl.order_id)
                            JOIN stock_location AS loc ON (loc.id = po.location_id)
                            JOIN stock_location AS loc1 ON (loc.location_id = loc1.id)
                            WHERE po.date_order >= '%s'
                            AND po.date_order <= '%s'
                            AND po.session_id = '%s'
                            GROUP BY loc.name, loc1.name
                            limit %s
                            """%((from_date,to_date, session_id, limit)))
                        return self._cr.fetchall()
                    else:
                        self._cr.execute("""
                            SELECT (loc1.name || '/' || loc.name) as name, sum(psl.price_unit) FROM pos_order_line AS psl
                            JOIN pos_order AS po ON (po.id = psl.order_id)
                            JOIN stock_location AS loc ON (loc.id = po.location_id)
                            JOIN stock_location AS loc1 ON (loc.location_id = loc1.id)
                            WHERE po.date_order >= '%s'
                            AND po.date_order <= '%s'
                            GROUP BY loc.name, loc1.name
                            limit %s
                            """%((from_date,to_date, limit)))
                        return self._cr.fetchall()
                if category == 'income_by_journals':
                    if current_session_report:
                        self._cr.execute("""
                            select aj.name, sum(absl.amount) from account_bank_statement_line absl
                            join account_journal aj on absl.journal_id = aj.id
                            join pos_session as ps on ps.name = absl.ref
                            join pos_config as pc on pc.id = ps.config_id
                            where absl.create_date >= '%s' and absl.create_date <= '%s'
                            and ps.id = '%s'
                            group by aj.name
                            limit %s
                            """%((from_date,to_date, session_id, limit)))
                        return self._cr.fetchall()
                    else:
                        self._cr.execute("""
                        select aj.name, sum(absl.amount) from account_bank_statement_line absl
                        join account_journal aj on absl.journal_id = aj.id
                        join pos_session as ps on ps.name = absl.ref
                        join pos_config as pc on pc.id = ps.config_id
                        where absl.create_date >= '%s' and absl.create_date <= '%s'
                        group by aj.name
                        limit %s
                        """%((from_date,to_date, limit)))
                    return self._cr.fetchall()
                if category == 'top_category':
                    if current_session_report:
                        self._cr.execute("""
                            SELECT pc.name, sum((pol.price_unit * pol.qty) - pol.discount) 
                            FROM pos_category pc
                            join product_template pt on pc.id = pt.pos_categ_id
                            join product_product pp on pt.id = pp.product_tmpl_id
                            join pos_order_line pol on pp.id = pol.product_id
                            join pos_order po on pol.order_id = po.id
                            where pol.create_date >= '%s' and pol.create_date <= '%s'
                            and po.session_id = '%s'
                            group by pc.name
                            ORDER BY sum(pol.price_unit) DESC
                            limit %s
                            """%((from_date,to_date, session_id, limit)))
                        return self._cr.fetchall()
                    else:
                        self._cr.execute("""
                            SELECT pc.name, sum((pol.price_unit * pol.qty) - pol.discount) 
                            FROM pos_category pc
                            join product_template pt on pc.id = pt.pos_categ_id
                            join product_product pp on pt.id = pp.product_tmpl_id
                            join pos_order_line pol on pp.id = pol.product_id
                            join pos_order po on pol.order_id = po.id
                            where pol.create_date >= '%s' and pol.create_date <= '%s'
                            group by pc.name
                            ORDER BY sum(pol.price_unit) DESC
                            limit %s
                            """%((from_date,to_date, limit)))
                        return self._cr.fetchall()
                if category == 'pos_benifit':
                    domain = False
                    if current_session_report:
                        domain = [('date_order', '>=', from_date),
                                      ('date_order', '<=', to_date),
                                      ('session_id','=',session_id)]
                    else:
                        domain = [('date_order', '>=', from_date),
                                      ('date_order', '<=', to_date)]
                    if domain and len(domain) > 1:
                        order_ids = self.env['pos.order'].search(domain, order='date_order desc')
                        if len(order_ids) > 0:
                            profit_amount = 0
                            loss_amount = 0
                            loss = 0
                            profit = 0
                            for order in order_ids:
                                for line in order.lines:
                                    cost_price = line.product_id.standard_price * line.qty
                                    sale_price = line.price_subtotal
                                    profit_amount += (sale_price - cost_price)
                                    loss_amount += (cost_price - sale_price)
                            if loss_amount > 0:
                                loss = loss_amount
                            if profit_amount > 0:
                                profit = profit_amount
                            return [('Profit', profit), ('Loss', loss)]
                    return False
        except Exception as e:
           return {'error':e}

    customer_email = fields.Char('Customer Email')
    parent_return_order = fields.Char('Return Order ID', size=64)
    return_seq = fields.Integer('Return Sequence')
    return_process = fields.Boolean('Return Process')
    back_order = fields.Char('Back Order', size=256, default=False, copy=False)
    is_rounding = fields.Boolean("Is Rounding")
    rounding_option = fields.Char("Rounding Option")
    rounding = fields.Float(string='Rounding', digits=0)
    delivery_date = fields.Char("Delivery Date")
    delivery_time = fields.Char("Delivery Time")
    delivery_address = fields.Char("Delivery Address")
    delivery_charge_amt = fields.Float("Delivery Charge")
    total_loyalty_earned_points = fields.Float("Earned Loyalty Points")
    total_loyalty_earned_amount = fields.Float("Earned Loyalty Amount")
    total_loyalty_redeem_points = fields.Float("Redeemed Loyalty Points")
    total_loyalty_redeem_amount = fields.Float("Redeemed Loyalty Amount")
    picking_ids = fields.Many2many(
            "stock.picking",
            string="Multiple Picking",
            copy=False)
    partial_pay = fields.Boolean("Partial Pay", readonly=True)
#     order_booked = fields.Boolean("Booked", readonly=True)
    amount_due = fields.Float(string='Amount Due', compute='_compute_amount_due')
    fresh_order = fields.Boolean("Fresh Order")
    table_ids = fields.Many2many('restaurant.table', string="Tables", help='The table where this order was served')
    floor_id = fields.Many2one(related="table_id.floor_id", string="Floor")
    #Credit
    is_delivery = fields.Boolean(string='Is Delivery Order')
    #Debit
    is_debit = fields.Boolean(string="Is Debit")
    rating = fields.Selection(
        [('0', 'No Rating'), ('1', 'Bad'), ('2', 'Not bad'), ('3', 'Normal'), ('4', 'Good'), ('5', 'Very Good'), ('6', 'Excellent')],
        string='Rating')
    delivery_type = fields.Selection([('none','None'),('pending','Pending'),('delivered','Delivered')], string="Delivery Type", default="none")
    delivery_user_id = fields.Many2one('res.users',string="Delivery User")
    increment_number = fields.Char(string="Increment Number")
    shop_id = fields.Many2one("pos.shop", string="Shop",readonly=True)
    order_on_debit = fields.Boolean(string='Ordered On Debit')
    pos_normal_receipt_html = fields.Char(string="Pos Normal Receipt HTML")
    pos_xml_receipt_html = fields.Char(string="Pos Normal Receipt XML")
    kitchen_status = fields.Selection([('waiting','Waiting'), ('done','Done')], string="Kitchen Status")
    asst_cashier_id = fields.Many2one('res.users', string="Asst. Cashier")
    rest_table_reservation_id = fields.Many2one('restaurant.table.reservation', string='Reserve Table')
    online_order_ref = fields.Char(string="Online Order Ref")
    reason_of_return = fields.Text(string="Reason")
    return_cust_mobile = fields.Text(string="Customer Mobile")
    order_mode = fields.Selection([('drive_through_mode','Drive Through'),
                                 ('dine_in_mode','Comedor'),('online_mode','Rapido'),('take_away','Domicilio')])


class pos_order_line(models.Model):
    _inherit = 'pos.order.line'

    @api.model
    def load_pos_order_lines(self, line_ids):
        lines = self.env['pos.order.line'].search_read([('id','in',line_ids)])
        for line in lines:
            line['tech_combo_data'] = ast.literal_eval(line.get('tech_combo_data')) if line and line.get('tech_combo_data') else False
        return lines

    @api.model
    def load_return_order_lines(self, pos_order_id):
        valid_return_lines = []
        current_date = datetime.today().strftime('%Y-%m-%d')
        if pos_order_id:
            order_id = self.env['pos.order'].browse(pos_order_id)
            if order_id and order_id.config_id.enable_print_valid_days:
                order_lines = self.search([('order_id', '=', pos_order_id),('return_qty', '>', 0)])
                if order_lines:
                    for line in order_lines:
                        if line.return_valid_days > 0 and not line.product_id.is_dummy_product:
                                date_N_days_after = ((order_id.date_order + timedelta(days=line.return_valid_days))).strftime('%Y-%m-%d')
                                if current_date <= date_N_days_after:
                                    valid_return_lines.append(line.read()[0])
            else:
                return self.search_read([('order_id', '=', pos_order_id),('return_qty', '>', 0)])
        return valid_return_lines

    @api.multi
    def return_order_kanban_view(self):
        return {
            'type': 'ir.actions.act_window',
            'name':self.product_id.name,
            'res_model': "pos.order",
            'view_type': 'form',
            'view_mode': 'kanban',
            'res_id': self.order_id.id,
            'domain' : [('id', '=', self.order_id.id)],
        }

    @api.model
    def create(self, values):
        if values.get('product_id') and not values.get('from_credit'):
            if self.env['pos.order'].browse(values['order_id']).session_id.config_id.prod_for_payment.id == values.get('product_id'):
                return
        res = super(pos_order_line, self).create(values)
        if not values.get('back_order') and res.order_id.amount_due <= 0:
            res.create_mo()
        if values.get('modifier_line'):
            modifier_order_line = self.env['modifier.order.line']
            for modifier in values.get('modifier_line'):
                modifier_order_line.create({
                    'line_id': res.id,
                    'modifier_id': modifier.get('id'),
                    'qty': modifier.get('qty'),
                    'name':modifier.get('name'),
                    'price':modifier.get('price'),
                    'product_id': modifier.get('product_id'),
                    'prod_mod_id':modifier.get('id'),
                })
        return res

    @api.model
    def create_mo(self):
        """
        Create manufacturing order for order which has item to be cook
        :return type : True  or False
        """
        flag = True
        if self and self.product_id and self.product_id.product_tmpl_id.id and self.qty > 0:
            bom_obj = self.env['mrp.bom']
            bom_id = bom_obj._bom_find(self.product_id.product_tmpl_id, self.product_id)
            if bom_id:
                mrp_production = self.env['mrp.production']
                default_dict = mrp_production.default_get(['priority', 'date_planned_start', 'product_uom',
                                                           'product_uos_qty', 'user_id', 'company_id',
                                                           'name', 'date_planned', 'location_src_id',
                                                           'location_dest_id', 'message_follower_ids'])
                default_dict.update({
                    'product_id': self.product_id.id,
                    'bom_id': bom_id.id or False,
                    'product_qty': self.qty,
                    'product_uom_id': self.product_id.uom_id.id,
                    'origin': 'Kitchen POS',
                    'product_uos_qty': self.qty,
                    'product_uos': self.product_id.uom_id.id,
                    'company_id': self.order_id.company_id.id,
                    'location_src_id': self.order_id.session_id.config_id.stock_location_id.id,
                    'location_dest_id': self.order_id.session_id.config_id.stock_location_id.id,
                })

                if self.order_id.session_id.config_id.mrp_operation_type:
                    default_dict.update({
                        'picking_type_id': self.order_id.session_id.config_id.mrp_operation_type.id,
                    })

                mo_id = mrp_production.create(default_dict)
                for each in bom_id.bom_line_ids:
                    product_available_qty = self.env['product.product'].browse(each.product_id.id).with_context({'location':self.order_id.session_id.config_id.stock_location_id.id}).qty_available
                    if product_available_qty < each.product_qty:
                        flag = False
                if flag:
                    mo_id.action_assign()
                    mo_id.open_produce_product()
                    produce_d = self.env['mrp.product.produce'].with_context({'active_ids': [mo_id.id], 'active_id': mo_id.id}).create({
                        'product_qty': self.qty})
                    produce_d._onchange_product_qty()
                    produce_d.do_produce()
                    mo_id.post_inventory()
                    mo_id.button_mark_done()

                self.write({'mo_id': mo_id.id})
        return True

    @api.model
    def update_orderline_state(self,vals):
        order_line = self.browse(vals['order_line_id'])
        notifications = []
        flag = True
        res = order_line.write({
            'state': vals['state']
        });
        vals['pos_reference'] = order_line.order_id.pos_reference
        vals['pos_cid'] = order_line.pos_cid
        vals['order_id'] = order_line.order_id.id
        for line in order_line.order_id.lines:
            if line.state != 'done':
                flag = False
        if flag:
            order_line.order_id.write({
                'kitchen_status':'done',
            })
            vals['kitchen_status'] = 'done'
        if order_line.order_id.user_id.user_role == 'ass_cashier':
            cashier = self.env['res.users'].search([('sales_persons','in', order_line.order_id.user_id.id)], limit=1)
            if cashier:
                notifications.append([(self._cr.dbname, 'pos.order.line', cashier.id), {'order_line_state': vals}])
#         else:
        notifications.append([(self._cr.dbname, 'pos.order.line', order_line.create_uid.id), {'order_line_state': vals}])
        self.env['bus.bus'].sendmany(notifications)
        return res

    line_note = fields.Char('Comment', size=512)
    cost_price = fields.Float("Cost")
    deliver = fields.Boolean("Is deliver")
    return_qty = fields.Integer('Return QTY', size=64)
    return_process = fields.Char('Return Process')
    back_order = fields.Char('Back Order', size=256, default=False, copy=False)
    location_id = fields.Many2one('stock.location', string='Location')
    mod_lines = fields.One2many('modifier.order.line', 'line_id', 'Modifiers')
    modifier = fields.Boolean("Modifier")
    is_takeaway = fields.Boolean('Domicilio')
    drive_through_mode = fields.Boolean('Drive Thru')
    dine_in_mode = fields.Boolean('Comedor')
    online_mode = fields.Boolean('Online')
    mo_id = fields.Many2one('mrp.production', 'MO', invisible=True)
    table_id = fields.Many2one(related='order_id.table_id', string="Table")
    floor_id = fields.Many2one(related='table_id.floor_id', string="Floor")
    state = fields.Selection(selection=[("waiting", "Waiting"), ("preparing", "Preparing"), ("delivering", "Waiting/deliver"),("done","Done"),("cancel","Cancel")],default="waiting")
    pos_cid = fields.Char("pos cid")
    return_valid_days = fields.Integer(string="Return Valid Days")
    priority = fields.Selection([('low','Low'),('medium','Medium'),('high','High')], string="Priority")
    is_combo_line = fields.Boolean(string="Is Combo Order line")
    delivery_product_id = fields.Many2one('product.product',string="Delivery Product")
    tech_combo_data = fields.Char(string="Tech Combo Info")
    combo_product_id = fields.Many2one('product.product',string="Combo Product Id")
    is_main_combo_product = fields.Boolean("Is Main Combo Product")
    drive_through_mode = fields.Boolean('Drive Thru')
    dine_in_mode = fields.Boolean('Comedor')
    online_mode = fields.Boolean('Rápido')


class res_partner(models.Model):
    _inherit = 'res.partner'

    prefer_ereceipt = fields.Boolean('Prefer E-Receipt')

    @api.multi
    def _compute_remain_credit_limit(self):
        
        for partner in self:
            total_credited = 0
            orders = self.env['pos.order'].search([('partner_id', '=', partner.id),('state_order_fac', '=', 'n'),
                                                   ('order_type', '=', 'Cŕedito'),('is_postpaid','=',True)])
            for order in orders:
                total_credited += order.amount_total
            partner.remaining_credit_limit = partner.credit_limit - total_credited

    remaining_credit_limit = fields.Float("Remaining Credit Limit", compute="_compute_remain_credit_limit")


class quick_cash_payment(models.Model):
    _name = "quick.cash.payment"
    _description = 'quick cash payment'

    name = fields.Float(string='Amount')

    _sql_constraints = [
        ('quick_cash_payment', 'unique(name)', 'This amount already selected'),
    ]


class CashControl(models.Model):
    _name = 'custom.cashcontrol'
    _description = 'custom cashcontrol'

    coin_value = fields.Float(string="Coin/Bill Value")
    number_of_coins = fields.Integer(string="Number of Coins")
    subtotal = fields.Float(string="Subtotal")
    pos_session_id = fields.Many2one(comodel_name='pos.session',string="Session Id")


class pos_session(models.Model):
    _inherit = 'pos.session'

    current_cashier_id  = fields.Many2one('res.users' ,string="Cashier" ,readonly=True)
    locked = fields.Boolean("Locked" )
    locked_by_user_id = fields.Many2one('res.users' ,string="Locked By")
    cashcontrol_ids = fields.One2many(comodel_name="custom.cashcontrol", inverse_name="pos_session_id",
                                 string="Cash Control Information")
    opening_balance = fields.Boolean(string="Opening Balance")
    increment_number = fields.Integer(string="Increment Number", default=0, size=3, help="This is a field is used for show increment number on kitchen screen when create pos order from point of sale.")
    shop_id = fields.Many2one('pos.shop',string='Shop' ,related='config_id.multi_shop_id')

    def action_pos_session_closing_control(self):
        postpaid_journal = self.env['account.journal'].sudo().search([('code', '=', 'POSCR'),('company_id', '=', self.env.user.company_id.id)],limit=1)        
        if(postpaid_journal):
            account_bank_statements_lines = self.env['account.bank.statement.line'].sudo().search([('journal_id', '=', postpaid_journal.id)]) 
            for account_bank_statements_line in account_bank_statements_lines:
                account_bank_statements_line.sudo().update({'account_id':postpaid_journal.default_credit_account_id.id})
            pass
        else:
            raise Warning("Debe existir un diario con codigo corto POSCR para la compañia "+str(self.env.user.company_id.name))

        super(pos_session, self).action_pos_session_closing_control()

    @api.multi
    def get_payments_by_service_type(self):
        response = {'online':0.0,'dine_in':0.0,'take_away':0.0}
        if self:            
            pos_order = self.env["pos.order"]
            user = self.env['res.users'].search([["id","=",self._uid]],limit=1)            
            pos_orders_online = pos_order.search([('session_id', '=', self.id), ('state', 'in', ['paid', 'invoiced', 'done']), ('user_id', '=', self.user_id.id), ('company_id', '=', user.company_id.id), ('order_mode', '=', 'online_mode')])

            currency_id = self.mapped('order_ids.lines.company_id.currency_id')
            if len(currency_id) > 1:
                currency_id = currency_id[0]

            total_online = 0.0
            for item in pos_orders_online:
                total_online += float(item.amount_paid)
            
            pos_orders_dine_in = pos_order.search([('session_id', '=', self.id), ('state', 'in', ['paid', 'invoiced', 'done']), ('user_id', '=', self.user_id.id), ('company_id', '=', user.company_id.id), ('order_mode', '=', 'dine_in_mode')])
            total_dine_in = 0.0
            for item in pos_orders_dine_in:
                total_dine_in += float(item.amount_paid)
            
            pos_orders_take_away = pos_order.search([('session_id', '=', self.id), ('state', 'in', ['paid', 'invoiced', 'done']), ('user_id', '=', self.user_id.id), ('company_id', '=', user.company_id.id), ('order_mode', '=', 'take_away')])
            total_take_away = 0.0
            for item in pos_orders_take_away:
                total_take_away += float(item.amount_paid)

            response = {'online': currency_id.round(total_online),'dine_in': currency_id.round(total_dine_in),'take_away': currency_id.round(total_take_away)}
        return response

    @api.multi
    def get_payments_by_method(self,for_all_methods=False):
        if self:
            
            pos_order = self.env["pos.order"]
            user = self.env['res.users'].search([["id","=",self._uid]],limit=1)
            
            pos_orders_IDs = pos_order.search([('session_id', '=', self.id), ('state', 'in', ['paid', 'invoiced', 'done']), ('user_id', '=', self.user_id.id), ('company_id', '=', user.company_id.id)])
            data = {}
            if pos_orders_IDs:
                pos_orders_IDs = [pos.id for pos in pos_orders_IDs]
                account_bank_statement_line = self.env["account.bank.statement.line"]
                account_bank_statement_line_IDs = account_bank_statement_line.search([('pos_statement_id', 'in', pos_orders_IDs)])
                if account_bank_statement_line_IDs:
                    a_l = []
                    for r in account_bank_statement_line_IDs:
                        a_l.append(r['id'])
                    self._cr.execute("select aj.name,sum(amount) from account_bank_statement_line as absl,account_bank_statement as abs,account_journal as aj " \
                                    "where absl.statement_id = abs.id and abs.journal_id = aj.id  and absl.id IN %s " \
                                    "group  by aj.name", (tuple(a_l),))

                    data = self._cr.dictfetchall()
                    if(for_all_methods):
                        account_journal = self.env["account.journal"]
                        pos_journals = account_journal.search([('journal_user','=',True)])    
                        for pos_journal in pos_journals:
                            if(self.add_payment_method(data, pos_journal)==False):
                                data.append({'name':pos_journal.name, 'sum':0.0})                            

                    #f = open('/odoo_mexico_v12/custom/addons/flexibite_com_advance/data.js','a')
                    #f.write(str(data))
                    #f.close()

                    return data
            else:
                return {}
    
    @api.model           
    def add_payment_method(self, data, method):
        is_in = False
        for item in data:
            if(item['name'] == method.name):
                is_in = True
        return is_in
    
    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        user_rec = self.env['res.users'].browse(self._uid)
        erp_manager_id = self.env['ir.model.data'].get_object_reference('base',
                                                                         'group_erp_manager')[1]
        if user_rec and erp_manager_id not in user_rec.groups_id.ids:
            if user_rec.shop_ids:
                args += ['|',('shop_id', 'in', user_rec.shop_ids.ids),('shop_id', '=', False)]
            res = super(pos_session, self).search(args=args, offset=offset, limit=limit, order=order, count=count)
        else:
            res = super(pos_session, self).search(args=args, offset=offset, limit=limit, order=order, count=count)
        return res

    @api.multi
    def get_products_category_data(self,flag_config):
        product_list = []
        category_list = []
        user_allowed_company_ids = self.env.user.company_ids.ids
        if self.shop_id and self.shop_id.location_id.product_ids:
            for product in self.shop_id.location_id.product_ids:
                product_list.append(product.id)
        if self.shop_id and self.shop_id.location_id.category_ids:
            for cat in self.shop_id.location_id.category_ids:
                category_list.append(cat.id)
        dummy_products = self.env['product.product'].sudo().with_context({'location':self.config_id.stock_location_id.id}).search([('is_dummy_product','=',True)]).ids
        setting = self.env['res.config.settings'].sudo().search([], order='id desc', limit=1, offset=0)
        if flag_config == False:
            domain = ['|', ('is_dummy_product','=',True), ('sale_ok', '=', True),('available_in_pos', '=', True)]
        else:
            domain = ['|','|',('is_dummy_product','=',True),('id', 'in', product_list),('pos_categ_id', 'in', category_list),('sale_ok','=',True),('available_in_pos','=',True)]
        if setting and setting.group_multi_company and not setting.company_share_product:
            domain += ['|',('product_tmpl_id.company_id', 'in', user_allowed_company_ids),
                       ('product_tmpl_id.company_id', '=', False)]
        else:
            domain += [('product_tmpl_id.sale_ok', '=', True)]
        product_records = self.env['product.product'].with_context({'location':self.config_id.stock_location_id.id}).search(domain).ids
        if not product_records or len(dummy_products) >= len(product_records):
            domain = [('sale_ok', '=', True),('available_in_pos', '=', True)]
            if setting and setting.group_multi_company and not setting.company_share_product:
                domain += ['|', ('product_tmpl_id.company_id', 'in', user_allowed_company_ids),
                           ('product_tmpl_id.company_id', '=', False)]
            product_records = self.env['product.product'].with_context({'location':self.config_id.stock_location_id.id,'compute_child': False}).search(domain).ids
        return product_records

    @api.multi
    def get_pos_name(self):
        if self and self.config_id:
            return self.config_id.name

    @api.multi
    def get_inventory_details(self):
        product_category = self.env['product.category'].search([])
        product_product = self.env['product.product']
        stock_location = self.config_id.stock_location_id;
        inventory_records = []
        final_list = []
        product_details = []
        if self and self.id:
            for order in self.order_ids:
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
        for each in custom_list:
            product_id = product_product.browse(each.get('id'))
            if product_id:
                inventory_records.append({
                    'product_id': [product_id.id, product_id.name],
                    'category_id': [product_id.id, product_id.categ_id.name],
                    'used_qty': each.get('qty'),
                    'quantity': product_id.with_context(
                        {'location': stock_location.id, 'compute_child': False}).qty_available,
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
                                qty = rec.get('quantity') + each.get('quantity')
                                rec.update({'quantity': qty})
                final_list = sorted(temp_obj, key=lambda k: k['quantity'])
        return final_list or []

    @api.multi
    def get_goole_api_key(self):
        rec_api_key = self.env['ir.config_parameter'].sudo().search([('key','=','google_api_key')],limit=1,order="id desc")
        if rec_api_key:
            return rec_api_key.read()
        else:
            return []

    def _confirm_orders(self):
        for session in self:
            company_id = session.config_id.journal_id.company_id.id
            orders = session.order_ids.filtered(lambda order: order.state == 'paid')
            journal_id = self.env['ir.config_parameter'].sudo().get_param(
                'pos.closing.journal_id_%s' % company_id, default=session.config_id.journal_id.id)

            move = self.env['pos.order'].with_context(force_company=company_id)._create_account_move(session.start_at, session.name, int(journal_id), company_id)
            orders.with_context(force_company=company_id)._create_account_move_line(session, move)
            for order in session.order_ids.filtered(lambda o: o.state not in ['done', 'invoiced']):
                if order.state not in ('draft'):
                    # raise UserError(_("You cannot confirm all orders of this session, because they have not the 'paid' status"))
                    order.action_pos_order_done()

    @api.multi
    def action_pos_session_open(self):
        pos_order = self.env['pos.order'].search([('state', '=', 'draft')])
        for order in pos_order:
            if order.session_id.state != 'opened':
                order.write({'session_id': self.id})
        return super(pos_session, self).action_pos_session_open()

    @api.multi
    def custom_close_pos_session(self):
        postpaid_journal = self.env['account.journal'].sudo().search([('code', '=', 'POSCR'),('company_id', '=', self.env.user.company_id.id)],limit=1)        
        if(postpaid_journal):
            account_bank_statements_lines = self.env['account.bank.statement.line'].sudo().search([('journal_id', '=', postpaid_journal.id)]) 
            for account_bank_statements_line in account_bank_statements_lines:
                account_bank_statements_line.sudo().update({'account_id':postpaid_journal.default_credit_account_id.id})
            pass
        else:
            raise Warning("Debe existir un diario con codigo corto POSCR para la compañia "+str(self.env.user.company_id.name))
        self._check_pos_session_balance()
        for session in self:
            session.write({'state': 'closing_control', 'stop_at': fields.Datetime.now()})
            if not session.config_id.cash_control:
                session.action_pos_session_close()
                return True
            if session.config_id.cash_control:
                self._check_pos_session_balance()
                return self.action_pos_session_close()
    @api.multi
    def cash_statement_ids(self, vals):
        for statement in self.statement_ids:
            for val in vals:
                if int(val.get('journal_id')) == statement.journal_id.id:
                    balance_end_real = val.get('balance_end_real')
                    if '$' in val.get('balance_end_real'):
                        balance_end_real = balance_end_real.replace('$','')
                    statement.write({
                        'balance_end_real': float(balance_end_real)
                    })
        return True

    @api.multi
    def cash_control_line(self,vals):
        total_amount = 0.00
        if vals:
            self.cashcontrol_ids.unlink()
            for data in vals:
                self.env['custom.cashcontrol'].create(data)
        for cash_line in self.cashcontrol_ids:
            total_amount += cash_line.subtotal
        for statement in self.statement_ids:
            statement.write({'balance_end_real': total_amount})
        return True

    @api.multi
    def open_balance(self, vals):
        for statement in self.statement_ids:
            statement.write({'balance_start': vals})
        self.write({'opening_balance':False})
        return True

    @api.multi
    def close_open_balance(self):
        self.write({'opening_balance': False})
        return True

    @api.model
    def get_proxy_ip(self):
        proxy_id = self.env['res.users'].browse([self._uid]).company_id.report_ip_address
        return {'ip': proxy_id or False}

    @api.multi
    def get_user(self):
        if self._uid == SUPERUSER_ID:
            return True
    @api.multi
    def get_gross_total(self):
        gross_total = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                for line in order.lines:
                    gross_total += line.qty * (line.price_unit - line.product_id.standard_price)
        return gross_total

    @api.multi
    def get_product_cate_total(self):
        balance_end_real = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                if order.state != "draft":
                    for line in order.lines:
                        balance_end_real += (line.qty * line.price_unit)
        return balance_end_real

    @api.multi
    def get_net_gross_total(self):
        net_gross_profit = 0.0
        if self:
            net_gross_profit = self.get_gross_total() - self.get_total_tax()
        return net_gross_profit

    @api.multi
    def get_product_name(self, category_id):
        if category_id:
            category_name = self.env['pos.category'].browse([category_id]).name
            return category_name

    @api.multi
    def get_payments(self):
        if self:
            statement_line_obj = self.env["account.bank.statement.line"]
            pos_order_obj = self.env["pos.order"]
            company_id = self.env['res.users'].browse([self._uid]).company_id.id
            pos_ids = pos_order_obj.search([('state','in',['paid','invoiced','done']),
                                            ('company_id', '=', company_id),('session_id','=',self.id)])
            data={}
            if pos_ids:
                pos_ids = [pos.id for pos in pos_ids]
                st_line_ids = statement_line_obj.search([('pos_statement_id', 'in', pos_ids)])
                if st_line_ids:
                    a_l=[]
                    for r in st_line_ids:
                        a_l.append(r['id'])
                    self._cr.execute("select aj.name,sum(amount) from account_bank_statement_line as absl,account_bank_statement as abs,account_journal as aj " \
                                    "where absl.statement_id = abs.id and abs.journal_id = aj.id  and absl.id IN %s " \
                                    "group by aj.name ",(tuple(a_l),))

                    data = self._cr.dictfetchall()
                    return data
            else:
                return {}

    @api.multi
    def get_product_category(self):
        product_list = []
        if self and self.order_ids:
            for order in self.order_ids:
                if order.state != 'draft':
                    for line in order.lines:
                        flag = False
                        product_dict = {}
                        for lst in product_list:
                            if line.product_id.pos_categ_id:
                                if lst.get('pos_categ_id') == line.product_id.pos_categ_id.id:
                                    lst['price'] = lst['price'] + (line.qty * line.price_unit)
                                    flag = True
                            else:
                                if lst.get('pos_categ_id') == '':
                                    lst['price'] = lst['price'] + (line.qty * line.price_unit)
                                    flag = True
                        if not flag:
                            product_dict.update({
                                        'pos_categ_id': line.product_id.pos_categ_id and line.product_id.pos_categ_id.id or '',
                                        'price': (line.qty * line.price_unit)
                                    })
                            product_list.append(product_dict)
        return product_list

    @api.multi
    def get_journal_amount(self):
        journal_list = []
        if self and self.statement_ids:
            for statement in self.statement_ids:
                journal_dict = {}
                journal_dict.update({'journal_id': statement.journal_id and statement.journal_id.name or '',
                                     'ending_bal': statement.balance_end_real or 0.0})
                journal_list.append(journal_dict)
        return journal_list

    @api.multi
    def get_total_closing(self):
        if self:
            return self.cash_register_balance_end_real

    @api.multi
    def get_precision(self, price):
        precision = self.env['decimal.precision'].precision_get('Product Price')
        total_price_formatted = "{:.{}f}".format(price, precision)
        return total_price_formatted

    @api.multi
    def get_total_sales(self):
        total_price = 0.0
        if self:
            for order in self.order_ids:
                if order.state != "draft":
                    total_price += sum([(line.qty * line.price_unit) for line in order.lines])
        return total_price

    @api.multi
    def get_total_tax(self):
        total_tax = 0.0
        if self:
            pos_order_obj = self.env['pos.order']
            total_tax += sum([order.amount_tax for order in pos_order_obj.search([('session_id', '=', self.id)])])
        return total_tax

    @api.multi
    def get_vat_tax(self):
        taxes_info = {}
        taxes_details = []
        if self:
            total_tax = 0.00
            net_total = 0.00
            for order in self.order_ids:
                for line in order.lines:
                    price_unit = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
                    taxes = line.tax_ids_after_fiscal_position.compute_all(price_unit, self.currency_id, line.qty,
                                                                           line.product_id,
                                                                           line.order_id.partner_id)['taxes']
                    price_subtotal = line.price_subtotal
                    net_total += price_subtotal
                    for tax in taxes:
                        if not taxes_info or (taxes_info and not taxes_info.get(tax['id'], False)):
                            taxes_info[tax['id']] = {'id': tax['id'],
                                                     'tax_name': tax['name'],
                                                     'tax_total': tax['amount'],
                                                     'net_total': tax['base'],
                                                     'gross_tax': tax['amount'] + tax['base']
                                                     }
                        else:
                            total_tax = tax['amount'] + taxes_info[tax['id']].get('tax_total', 0.0)
                            net_total = tax['base'] + taxes_info[tax['id']].get('net_total', 0.0)

                            taxes_info[tax['id']].update({
                                'tax_total': total_tax,
                                'net_total': net_total,
                                'gross_tax': total_tax + net_total
                            })
        for key, val in taxes_info.items():
            taxes_details.append(val)
        return taxes_details

    @api.multi
    def get_total_discount(self):
        total_discount = 0.0
        discount_product_id = False
        is_discount = self.config_id.module_pos_discount
        if is_discount:
            discount_product_id = self.config_id.discount_product_id.id
        if self and self.order_ids:
            for order in self.order_ids:
                for line in order.lines:
                    total_discount += sum([((line.qty * line.price_unit) * line.discount) / 100])
                    if line.product_id.id == discount_product_id:
                        total_discount += abs(line.price_subtotal_incl)
        return total_discount

    @api.multi
    def get_total_first(self):
        total = 0.0
        if self:
            total = (self.get_total_sales() + self.get_total_tax())\
                - (abs(self.get_total_discount()))
        return total

    @api.multi
    def get_session_date(self, date_time):
        if date_time:
            if self._context and self._context.get('tz'):
                tz = timezone(self._context.get('tz'))
            else:
                tz = pytz.utc
            c_time = datetime.now(tz)
            hour_tz = int(str(c_time)[-5:][:2])
            min_tz = int(str(c_time)[-5:][3:])
            sign = str(c_time)[-6][:1]
            if sign == '+':
                date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) + \
                                                    timedelta(hours=hour_tz, minutes=min_tz)
            else:
                date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) - \
                                                    timedelta(hours=hour_tz, minutes=min_tz)
            return date_time.strftime('%d/%m/%Y %I:%M:%S %p')

    @api.multi
    def get_session_time(self, date_time):
        if date_time:
            if self._context and self._context.get('tz'):
                tz = timezone(self._context.get('tz'))
            else:
                tz = pytz.utc
            c_time = datetime.now(tz)
            hour_tz = int(str(c_time)[-5:][:2])
            min_tz = int(str(c_time)[-5:][3:])
            sign = str(c_time)[-6][:1]
            if sign == '+':
                date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) + \
                                                    timedelta(hours=hour_tz, minutes=min_tz)
            else:
                date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) - \
                                                    timedelta(hours=hour_tz, minutes=min_tz)
            return date_time.strftime('%I:%M:%S %p')

    @api.multi
    def get_current_date(self):
        if self._context and self._context.get('tz'):
            tz = self._context['tz']
            tz = timezone(tz)
        else:
            tz = pytz.utc
        if tz:
#             tz = timezone(tz)
            c_time = datetime.now(tz)
            return c_time.strftime('%d/%m/%Y')
        else:
            return date.today().strftime('%d/%m/%Y')

    @api.multi
    def get_current_time(self):
        if self._context and self._context.get('tz'):
            tz = self._context['tz']
            tz = timezone(tz)
        else:
            tz = pytz.utc
        if tz:
#             tz = timezone(tz)
            c_time = datetime.now(tz)
            return c_time.strftime('%I:%M %p')
        else:
            return datetime.now().strftime('%I:%M:%S %p')

    @api.multi
    def get_company_data_x(self):
        return self.user_id.company_id

    @api.multi
    def get_current_date_x(self):
        if self._context and self._context.get('tz'):
            tz = self._context['tz']
            tz = timezone(tz)
        else:
            tz = pytz.utc
        if tz:
#             tz = timezone(tz)
            c_time = datetime.now(tz)
            return c_time.strftime('%d/%m/%Y')
        else:
            return date.today().strftime('%d/%m/%Y')

    @api.multi
    def get_session_date_x(self, date_time):
        if date_time:
            if self._context and self._context.get('tz'):
                tz = self._context['tz']
                tz = timezone(tz)
            else:
                tz = pytz.utc
            if tz:
#                 tz = timezone(tz)
                c_time = datetime.now(tz)
                hour_tz = int(str(c_time)[-5:][:2])
                min_tz = int(str(c_time)[-5:][3:])
                sign = str(c_time)[-6][:1]
                if sign == '+':
                    date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) + \
                                                        timedelta(hours=hour_tz, minutes=min_tz)
                else:
                    #raise Warning(datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) - timedelta(hours=hour_tz, minutes=min_tz))
                    date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) - \
                                                        timedelta(hours=hour_tz, minutes=min_tz)
            else:
                date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT)
            return date_time.strftime('%d/%m/%Y')

    @api.multi
    def get_current_time_x(self):
        if self._context and self._context.get('tz'):
            tz = self._context['tz']
            tz = timezone(tz)
        else:
            tz = pytz.utc
        if tz:
#             tz = timezone(tz)
            c_time = datetime.now(tz)
            return c_time.strftime('%I:%M %p')
        else:
            return datetime.now().strftime('%I:%M:%S %p')
    

    @api.multi
    def get_session_time_x(self, date_time):
        if date_time:
            if self._context and self._context.get('tz'):
                tz = self._context['tz']
                tz = timezone(tz)
            else:
                tz = pytz.utc
            if tz:
#                 tz = timezone(tz)
                c_time = datetime.now(tz)
                hour_tz = int(str(c_time)[-5:][:2])
                min_tz = int(str(c_time)[-5:][3:])
                sign = str(c_time)[-6][:1]
                if sign == '+':
                    date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) + \
                                                        timedelta(hours=hour_tz, minutes=min_tz)
                else:
                    date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT) - \
                                                        timedelta(hours=hour_tz, minutes=min_tz)
            else:
                date_time = datetime.strptime(str(date_time), DEFAULT_SERVER_DATETIME_FORMAT)
            return date_time.strftime('%I:%M:%S %p')

    @api.multi
    def get_total_sales_x(self):
        total_price = 0.0
        if self:
            for order in self.order_ids:
                    for line in order.lines:
                            total_price += (line.qty * line.price_unit)
        return "%.2f" % total_price

    @api.multi
    def get_total_returns_x(self):
        pos_order_obj = self.env['pos.order']
        total_return = 0.0
        if self:
            for order in pos_order_obj.search([('session_id', '=', self.id)]):
                if order.amount_total < 0:
                    total_return += abs(order.amount_total)
        return "%.2f" % total_return

    @api.multi
    def get_total_tax_x(self):
        total_tax = 0.0
        if self:
            pos_order_obj = self.env['pos.order']
            total_tax += sum([order.amount_tax for order in pos_order_obj.search([('session_id', '=', self.id)])])
        return "%.2f" % total_tax

    @api.multi
    def get_total_discount_x(self):
        total_discount = 0.0
        discount_product_id = False
        is_discount = self.config_id.module_pos_discount
        if is_discount:
            discount_product_id = self.config_id.discount_product_id.id
        if self and self.order_ids:
            for order in self.order_ids:
                for line in order.lines:
                    total_discount += sum([((line.qty * line.price_unit) * line.discount) / 100])
                    if line.product_id.id == discount_product_id:
                        total_discount += abs(line.price_subtotal_incl)
        return "%.2f" % total_discount

    @api.multi
    def get_total_first_x(self):
        global gross_total
        if self:
            gross_total = (self.get_total_sales() + self.get_total_tax()) \
                 + self.get_total_discount()
        return "%.2f" % gross_total

    @api.multi
    def get_user_x(self):
        if self._uid == SUPERUSER_ID:
            return True

    @api.multi
    def get_gross_total_x(self):
        total_cost = 0.0
        gross_total = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                for line in order.lines:
                    total_cost += line.qty * line.product_id.standard_price
        gross_total = self.get_total_sales() - \
                    + self.get_total_tax() - total_cost
        return "%.2f" % gross_total

    @api.multi
    def get_net_gross_total_x(self):
        net_gross_profit = 0.0
        total_cost = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                for line in order.lines:
                    total_cost += line.qty * line.product_id.standard_price
            net_gross_profit = self.get_total_sales() - self.get_total_tax() - total_cost
        return "%.2f" % net_gross_profit

    @api.multi
    def get_product_cate_total_x(self):
        balance_end_real = 0.0
        discount = 0.0
        vals = {}
        if self and self.order_ids:
            currency_id = self.mapped('order_ids.lines.company_id.currency_id')
            tax_id = [t.name for t in self.mapped('order_ids.lines.tax_ids_after_fiscal_position')]
            amount_tax_line = 0.0
            if len(currency_id) > 1:
                currency_id = currency_id[0]
            for o in self.mapped('order_ids.lines'):
                amount_tax_line += (o.price_subtotal_incl - o.price_subtotal)
            for order in self.order_ids:
                if order.state != "draft":
                    for line in order.lines:
                        balance_end_real += (line.qty * line.price_unit)
                        discount += line.discount
                        vals['balance_end_real'] = balance_end_real
                        vals['balance_discount'] = discount
                        vals['venta_neta'] = balance_end_real - discount
                        #tax_id.append([t.display_name for t in line.mapped('tax_ids_after_fiscal_position')])
            if len(currency_id) > 1:
                currency_id = currency_id[0]
            vals['amount_tax'] = currency_id[0].round(sum(self.mapped('order_ids.amount_tax')))
            vals['taxes'] = tax_id
            vals['amount_tax_line'] = currency_id[0].round(amount_tax_line)
            vals['amount_total'] = currency_id[0].round(sum(self.mapped('order_ids.amount_total')))

        currency_id = self.mapped('statement_ids.company_id.currency_id')[0]
        pos_session = self.env['pos.session'].sudo().search([])
        efectivo = currency_id.round(
            sum(pos_session.sudo().mapped('statement_ids').filtered(lambda c: c.journal_id.name == 'Efectivo').mapped('balance_end'))
        )
        tarjeta = currency_id.round(
            sum(pos_session.sudo().mapped('statement_ids').filtered(lambda c: c.journal_id.name == 'Tarjeta Bancaria').mapped('balance_end'))
        )
        credito = currency_id.round(
            sum(pos_session.sudo().mapped('statement_ids').filtered(lambda c: c.journal_id.name == 'POS-Crédito').mapped('balance_end'))
        )
        sobrante = 0.0
        faltante = 0.0
        total = efectivo + tarjeta + credito
        if total < vals['amount_total']:
            faltante = currency_id.round(total - vals['amount_total'])
        else:
            sobrante = currency_id.round(total - vals['amount_total'])

        vals.update({
            'efectivo': efectivo,
            'tarjeta': tarjeta,
            'credito': credito,
            'total': total,
            'sobrante': sobrante,
            'faltante': faltante,
        })

        for session in self:
            statement_ids = session.statement_ids # .filtered(lambda st: st.journal_id.name == 'POS - Debito (MXN)')
            for cash in statement_ids:
                negative_amount = cash.mapped('line_ids').filtered(lambda l: l.amount < 0)
                positive_amount = cash.mapped('line_ids').filtered(lambda l: l.amount > 0)
                currency_id = cash.company_id.currency_id
                dif_ncash = currency_id.round(sum(negative_amount.mapped('amount')))
                dif_pcash = currency_id.round(sum(positive_amount.mapped('amount')))
                ventas_efectivo = session.cash_register_balance_end

                ingresos_efectivo = dif_pcash
                retiros_efectivo = dif_ncash
                balance_start = session.cash_register_balance_start
                vals.update({
                    'balance_start': balance_start,
                    'currency': currency_id.symbol,
                    'digits': [69, currency_id.decimal_places],
                    'ventas':   ventas_efectivo,
                    'ingresos': ingresos_efectivo,
                    'retiros':  retiros_efectivo,
                    'transacciones': balance_start + ventas_efectivo + ingresos_efectivo + retiros_efectivo
                })
        return vals

    @api.multi
    def get_product_name_x(self, category_id):
        if category_id:
            category_name = self.env['pos.category'].browse([category_id]).name
            return category_name

    @api.multi
    def get_product_category_x(self):
        product_list = []
        if self and self.order_ids:
            for order in self.order_ids:
                if order.state != 'draft':
                    for line in order.lines:
                        flag = False
                        product_dict = {}
                        for lst in product_list:
                            if line.product_id.pos_categ_id:
                                if lst.get('pos_categ_id') == line.product_id.pos_categ_id.id:
                                    lst['price'] = lst['price'] + (line.qty * line.price_unit)
    #                                 if line.product_id.pos_categ_id.show_in_report:
                                    lst['qty'] = lst.get('qty') or 0.0 + line.qty
                                    flag = True
                            else:
                                if lst.get('pos_categ_id') == '':
                                    lst['price'] = lst['price'] + (line.qty * line.price_unit)
                                    lst['qty'] = lst.get('qty') or 0.0 + line.qty
                                    flag = True
                        if not flag:
                            if line.product_id.pos_categ_id:
                                product_dict.update({
                                            'pos_categ_id': line.product_id.pos_categ_id and line.product_id.pos_categ_id.id or '',
                                            'price': (line.qty * line.price_unit),
                                            'qty': line.qty
                                        })
                            else:
                                product_dict.update({
                                            'pos_categ_id': line.product_id.pos_categ_id and line.product_id.pos_categ_id.id or '',
                                            'price': (line.qty * line.price_unit),
                                        })
                            product_list.append(product_dict)
        return product_list

    @api.multi
    def get_payments_x(self):
        if self:
            statement_line_obj = self.env["account.bank.statement.line"]
            pos_order_obj = self.env["pos.order"]
            company_id = self.env['res.users'].browse([self._uid]).company_id.id
            pos_ids = pos_order_obj.search([('session_id', '=', self.id),
                                            ('state', 'in', ['paid', 'invoiced', 'done']),
                                            ('user_id', '=', self.user_id.id), ('company_id', '=', company_id)])
            data = {}
            if pos_ids:
                pos_ids = [pos.id for pos in pos_ids]
                st_line_ids = statement_line_obj.search([('pos_statement_id', 'in', pos_ids)])
                if st_line_ids:
                    a_l = []
                    for r in st_line_ids:
                        a_l.append(r['id'])
                    self._cr.execute("select aj.name,sum(amount) from account_bank_statement_line as absl,account_bank_statement as abs,account_journal as aj " \
                                    "where absl.statement_id = abs.id and abs.journal_id = aj.id  and absl.id IN %s " \
                                    "group by aj.name ", (tuple(a_l),))

                    data = self._cr.dictfetchall()
                    return data
            else:
                return {}

    is_lock_screen = fields.Boolean(string="Lock Screen")

    @api.model
    def get_session_report(self):
        try:
#             sql query for get "In Progress" session
            self._cr.execute("""
                select ps.id,pc.name, ps.name from pos_session ps
                left join pos_config pc on (ps.config_id = pc.id)
                where ps.state='opened'
            """)
            session_detail = self._cr.fetchall()
#
            self._cr.execute("""
                SELECT pc.name, ps.name, sum(absl.amount) FROM pos_session ps
                JOIN pos_config pc on (ps.config_id = pc.id)
                JOIN account_bank_statement_line absl on (ps.name = absl.ref)
                WHERE ps.state='opened'
                GROUP BY ps.id, pc.name;
            """)
            session_total = self._cr.fetchall()
#             sql query for get payments total of "In Progress" session
            lst = []
            for pay_id in session_detail:
                self._cr.execute("""
                    select pc.name, aj.name, abs.total_entry_encoding from account_bank_statement abs
                    join pos_session ps on abs.pos_session_id = ps.id
                    join pos_config pc on ps.config_id = pc.id
                    join account_journal aj on  abs.journal_id = aj.id
                    where pos_session_id=%s
                """%pay_id[0])
                bank_detail = self._cr.fetchall()
                for i in bank_detail:
                    if i[2] != None:
                        lst.append({'session_name':i[0],'journals':i[1],'total':i[2]})

            cate_lst = []
            for cate_id in session_detail:
                self._cr.execute("""
                    select pc.name, sum(pol.price_unit), poc.name from pos_category pc
                    join product_template pt on pc.id = pt.pos_categ_id
                    join product_product pp on pt.id = pp.product_tmpl_id
                    join pos_order_line pol on pp.id = pol.product_id
                    join pos_order po on pol.order_id = po.id
                    join pos_session ps on ps.id = po.session_id
                    join pos_config poc ON ps.config_id = poc.id
                    where po.session_id = %s
                    group by pc.name, poc.name
                """%cate_id[0])
                cate_detail = self._cr.fetchall()
                for j in cate_detail:
                    cate_lst.append({'cate_name':j[0],'cate_total':j[1],'session_name':j[2]})
            categ_null = []
            for cate_id_null in session_detail:
                self._cr.execute(""" 
                    select sum(pol.price_unit), poc.name from pos_order_line pol
                    join pos_order po on po.id = pol.order_id
                    join product_product pp on pp.id = pol.product_id
                    join product_template pt on pt.id = pp.product_tmpl_id
                    join pos_session ps on ps.id = po.session_id
                    join pos_config poc on ps.config_id = poc.id
                    where po.session_id = %s and pt.pos_categ_id is null
                    group by poc.name
                """%cate_id_null[0])
                categ_null_detail = self._cr.fetchall()
                for k in categ_null_detail:
                    categ_null.append({'cate_name':'Undefined Category','cate_total':k[0],'session_name':k[1]})
            all_cat = []
            for sess in session_total:
                def_cate_lst = []
                for j in cate_lst:
                    if j['session_name'] == sess[0]:
                        def_cate_lst.append(j)
                for k in categ_null:
                    if k['session_name'] == sess[0]:
                        def_cate_lst.append(k)
                all_cat.append(def_cate_lst)
            return {'session_total':session_total,'payment_lst':lst,'all_cat':all_cat}
        except Exception as e:
           return {'error':'Error Function Working'}

    @api.model
    def take_money_out(self, name, amount, session_id):
        try:
            cash_out_obj = self.env['cash.box.out']
            total_amount = 0.0
            active_model = 'pos.session'
            active_ids = [session_id]
            if active_model == 'pos.session':
                records = self.env[active_model].browse(active_ids)
                bank_statements = [record.cash_register_id for record in records if record.cash_register_id]
                if not bank_statements:
                    raise Warning(_('There is no cash register for this PoS Session'))
                res = cash_out_obj.create({'name': name, 'amount': amount})
                return res._run(bank_statements)
            else:
                return {}
        except Exception as e:
           return {'error':'There is no cash register for this PoS Session '}

    @api.model
    def put_money_in(self, name, amount, session_id):
        try:
            cash_out_obj = self.env['cash.box.in']
            total_amount = 0.0
            active_model = 'pos.session'
            active_ids = [session_id]
            if active_model == 'pos.session':
                records = self.env[active_model].browse(active_ids)
                bank_statements = [record.cash_register_id for record in records if record.cash_register_id]
                if not bank_statements:
                    raise Warning(_('There is no cash register for this PoS Session'))
                res = cash_out_obj.create({'name': name, 'amount': amount})
                return res._run(bank_statements)
            else:
                return {}
        except Exception as e:
            return {'error':e}

    @api.one
    @api.constrains('amount')
    def _check_amount(self):
        if not self._context.get('from_pos'):
            super(AccountBankStatementLine, self)._check_amount()

    @api.one
    @api.constrains('amount', 'amount_currency')
    def _check_amount_currency(self):
        if not self._context.get('from_pos'):
            super(AccountBankStatementLine, self)._check_amount_currency()

class ReturnOrderReason(models.Model):
    _name = "pos.order.pre.note"
    _description = "pos order pre note"

    name = fields.Char("Note")
    shortcut_name = fields.Char("ShortCut Name")
    type = fields.Selection([('order_note','Order Note'),('line_note','Line Note'),('all','All')], string="Type")

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: