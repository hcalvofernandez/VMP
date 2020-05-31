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
from datetime import datetime
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger('---------------------------------------------------------' + __name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'


    def _calc_limit(self):
        for partner in self:
            contract_obj = self.env['contract.contract']
            contract = contract_obj.search([('partner_id', '=', partner.id)])
            partner.credit_limit = contract.limit_credit
            partner.meal_plan_limit = contract.meal_plan_credit

    meal_plan_limit = fields.Float(
        string='Meal Plan Limite',
    )
    
    remaining_meal_plan_limit = fields.Float(compute="_calc_meal_plan_remaining", string="Credito Disponible", readonly=True)
  

    @api.multi
    def write(self, vals):
        res = super(ResPartner, self).write(vals)

        return res

    @api.multi
    def _calc_meal_plan_remaining(self):
        for partner in self:
            pos_orders = self.env['pos.order'].search([('partner_id', '=', partner.id), ('state', '=', 'paid'), ('is_meal_plan', '=', True)])
            amount = sum([order.amount_total for order in pos_orders]) or 0.00
            partner.remaining_meal_plan_limit = partner.meal_plan_limit - amount

    @api.model
    def get_partner_data(self,id_, amount):
        partner = self.sudo().browse(id_)
        remaining_credit_amount = float (partner.credit_limit) - (float(self.get_remaining_credit_amount(partner)) + float(amount))
        return {'credit_limit': partner.credit_limit, 'remaining_credit_amount':remaining_credit_amount, 'remaining_meal_plan_limit':partner.remaining_meal_plan_limit}
    
    @api.multi
    def get_remaining_credit_amount(self, partner):
        orders = self.env['pos.order'].search([('state','=','draft'),('is_postpaid','=',True),('partner_id','=',partner.id)])
        total = 0.0
        for order in orders:
            total = total + float(order.amount_total)
        return total



    def action_view_partner_invoices_postpago(self):
        return {'name': _('Pedidos a Cŕedito'), 'view_type': 'form', 'view_mode': 'tree', 'view_id': self.env.ref('point_of_sale.view_pos_order_tree').id, 'res_model': 'pos.order', 'type': 'ir.actions.act_window', 'target': 'current','domain':[('is_postpaid','=',True),('partner_id','=',self.id)]}
      
    
    def action_view_partner_invoices_prepaid(self):
        return {'name': _('Pedidos Débitados'), 'view_type': 'form', 'view_mode': 'tree', 'view_id': self.env.ref('point_of_sale.view_pos_order_tree').id, 'res_model': 'pos.order', 'type': 'ir.actions.act_window', 'target': 'current','domain':[('is_debit','=',True),('partner_id','=',self.id)]}

    def action_view_partner_invoices_mealplan(self):
        return {'name': _('Pedidos Meal Plan'), 'view_type': 'form', 'view_mode': 'tree', 'view_id': self.env.ref('point_of_sale.view_pos_order_tree').id, 'res_model': 'pos.order', 'type': 'ir.actions.act_window', 'target': 'current','domain':[('is_meal_plan','=',True),('partner_id','=',self.id)]}
    
    @api.model
    def calculate_partner(self):
        self._cr.execute("SELECT id FROM res_partner")
        partner_ids = [k.get('id') for k in self._cr.dictfetchall()]
        if partner_ids:
            return partner_ids
        else:
            return []

    # @api.model
    # def calculate_partner(self):
    #     partner_ids = self.search(
    #         [('customer', '=', True)])
    #     if partner_ids:
    #         return partner_ids.ids
    #     else:
    #         return []

    @api.model
    def create_partner(self,partner_info):
        partner_id = self.create({
             'name':partner_info.get('cust_name'),
             'email':partner_info.get('cust_email'),
             'mobile':partner_info.get('cust_mobile'),
         })
        partner = self.search_read([('id','=',partner_id.id)],partner_info.get('fields'))
        if partner:
            return partner
        else:
            return False

    @api.multi
    @api.depends('used_ids', 'recharged_ids')
    def compute_amount(self):
        total_amount = 0
        for ids in self:
            for card_id in ids.card_ids:
                total_amount += card_id.card_value
            ids.remaining_amount = total_amount
            
    @api.multi
    def get_transaction(self):
        form_view_id = self.env.ref('flexibite_com_advance.parnter_payment_tranction_view')
        pos_order_ids = self.env['pos.order'].search([('partner_id', '=', self.id)])
        statement_ids = self.env['account.bank.statement.line'].search([('partner_id', '=', self.id), ('is_postpaid', '=', True)])
        order_list_paid = []
        order_list_open = []
        statement_list = []
        for stament_id in statement_ids:
            statement_list.append((0, 0, {
                    'statement_id' : stament_id.id,
                    'name' : stament_id.name,
                    'date' : stament_id.date,
                    'amount' :stament_id.amount
                }))
        for order in pos_order_ids:
            if order.state == 'paid':
                 order_list_paid.append((0, 0, {
                           'name': order.name,
                           'date_order':order.date_order,
                           'customer_id':order.partner_id.id,
                           'amount_total':order.amount_total,
                           'state':order.state,
                           'pos_order_id':order.id,
                           'partner_payment_id':self.id,
                           }))
            if order.state == 'draft' and order.is_debit:
                order_list_open.append((0, 0, {
                           'name': order.name,
                           'date_order':order.date_order,
                           'customer_id':order.partner_id.id,
                           'amount_total':order.amount_total,
                           'amount_due' : order.amount_due,
                           'state':order.state,
                           'pos_order_id':order.id,
                           'partner_payment_id_open' : self.id
                           }))
                
        return {
            'res_model': 'partner.payment.transaction',
            'view_type': 'form',
            'view_mode': 'form',
            'name': _('Payment'),
            'views': [(form_view_id.id, 'form')],
            'view_id': form_view_id.id,
            'context' : {'default_partner_id':self.id, 'default_paid_pos_order__paid_ids':order_list_paid,
                         'default_paid_pos_order_open_ids': order_list_open, 'default_partner_statment_ids':statement_list},
            'type': 'ir.actions.act_window',
        }

    @api.one
    @api.depends('wallet_lines')
    def _calc_remaining(self):
        total = 0.00
        for s in self:
            for line in s.wallet_lines:
                total += line.credit - line.debit
        self.remaining_wallet_amount = total

    @api.multi
    def _calc_credit_remaining_(self):
        for partner in self:
            orders = self.env['pos.order'].search([('state','=','paid'),('is_postpaid','=',True),('partner_id','=',partner.id)])
            total = 0.0
            for order in orders:
                total = total + float(order.amount_total)
            
            partner.remaining_credit_amount = total
        #for partner in self:
        #    data = self.env['account.invoice'].sudo().get_outstanding_info(partner.id)
        #    amount = []
        #    amount_data = 0.00
        #    total = 0.00
        #    for pay in data['content']:
        #        amount_data = pay['amount']
        #        amount.append(amount_data)
        #    for each_amount in amount:
        #        total += each_amount
        #    partner.remaining_credit_amount = total

    @api.multi
    def _calc_debit_remaining(self):
        for partner in self:
            pos_orders = self.env['pos.order'].search([('partner_id', '=', partner.id), ('state', '=', 'paid'), ('is_debit', '=', True)])
            amount = sum([order.amount_total for order in pos_orders]) or 0.00
            partner.remaining_debit_amount = partner.debit_limit - amount

    remaining_credit_amount = fields.Float(compute="_calc_credit_remaining_", string="Remaining Credit Amount",store=True, readonly=True)
    debit_limit = fields.Float("Limite de Credito")
    credit_limit = fields.Float("Crédito límite")
    remaining_debit_amount = fields.Float(compute="_calc_debit_remaining", string="Credito Disponible",
                                           readonly=True)
    card_ids = fields.One2many('aspl.gift.card', 'customer_id', string="List of card")
    used_ids = fields.One2many('aspl.gift.card.use', 'customer_id', string="List of used card")
    recharged_ids = fields.One2many('aspl.gift.card.recharge', 'customer_id', string="List of recharged card")
    remaining_amount = fields.Char(compute=compute_amount , string="Remaining Amount", readonly=True)

    wallet_lines = fields.One2many('wallet.management', 'customer_id', string="Wallet", readonly=True)
    remaining_wallet_amount = fields.Float(compute="_calc_remaining", string="Remaining Wallet Amount", readonly=True, store=True)
    exchange_history_ids = fields.One2many('aspl.gift.card.exchange.history', 'customer_id')

class partner_payment_transaction(models.TransientModel):
    _name = 'partner.payment.transaction'
    _rec_name = 'partner_id'
    _description = 'partner.payment.transaction'
    
    partner_id = fields.Many2one('res.partner', string='Partner')
    paid_pos_order__paid_ids = fields.One2many('pos.order.details', 'partner_payment_id', string='Pos Orders')
    paid_pos_order_open_ids = fields.One2many('pos.order.details', 'partner_payment_id_open', string='Pos Order(s)',)
    partner_statment_ids = fields.One2many('partner.pos.statement.line', 'partner_payment_id', string='Statement')
    
    @api.multi
    def pay_amount(self):
        due_amount = 0.0
        for each in self.paid_pos_order_open_ids:
            if each.amount_due:
                due_amount += each.amount_due
        form_view_id = self.env.ref('flexibite_com_advance.partner_payment_pay_view')
        return {
            'res_model': 'partner.pay',
            'view_type': 'form',
            'view_mode': 'form',
            'name': _('Payment'),
            'views': [(form_view_id.id, 'form')],
            'target': 'new',
            'view_id': form_view_id.id,
            'context' : {'default_amount_due': due_amount,
                         'partner_id': self.partner_id.id},
            'type': 'ir.actions.act_window',
        }
    
    
class pos_order_details(models.TransientModel):
    _name = 'pos.order.details'
    _description = 'pos.order.details'
    
    partner_payment_id = fields.Many2one('partner.payment.transaction', string='Payment')
    partner_payment_id_open = fields.Many2one('partner.payment.transaction', string='Partner Payment')
    pos_order_id = fields.Many2one('pos.order', string='Pos Order')
    name = fields.Char(string='Nombre',)
    date_order = fields.Char(string='Fecha')
    amount_due = fields.Float(string='Monto')
    customer_id = fields.Many2one('res.partner', string='Cliente',)
    amount_total = fields.Float(string='Total',)
    state = fields.Selection([('draft', 'New'), ('cancel', 'Cancelled'), ('paid', 'Paid'), ('done', 'Posted'), ('invoiced', 'Invoiced')], string='Status',)

    
class partner_pos_statement(models.TransientModel):
    _name = 'partner.pos.statement.line'
    _description = 'partner.pos.statement.line'
    
    partner_payment_id = fields.Many2one('partner.payment.transaction', string='Payment')
    statement_id = fields.Many2one('account.bank.statement.line', string='Statement')
    name = fields.Char(string='Name')
    date = fields.Char(string='Date')
    amount = fields.Float(string='Amount')

    
class partner_pay(models.TransientModel):
    _name = 'partner.pay'
    _description = 'partner.pay'

    amount_due = fields.Float(string='Amount Due')
    amount_to_paid = fields.Float(string='Amount to be paid')
    config_id = fields.Many2one('pos.config', required=True)
    journal_id = fields.Many2one('account.journal', string='Journal')
    
    @api.multi
    def payment(self):
        session_id = self.env['pos.session'].search([('config_id', '=', self.config_id.id), ('state', '=', 'opened')])
        if not session_id:
            raise ValidationError(_('No such active session found for this POS.'))
        else:
            get_journal_id = self.journal_id.id
            pos_session_id = session_id
            pay_due = self.amount_due
            account_payment_obj = self.env['account.payment']
            pos_order_obj = self.env['pos.order']
            affected_order = []
            wiz_id = self.env['partner.payment.transaction'].search([('id', '=', self._context.get('active_id'))])
            partner_id = wiz_id.partner_id.id
            amount = self.amount_to_paid
            if pay_due:
                res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft')], order='date_order')
                for each in res:
                    if amount > 0:
                        if each.amount_due < amount:
                            amount -= each.amount_due
                            values = self.env['pos.make.payment'].with_context(
                                {'active_id': each.id, 'default_journal_id': get_journal_id, 'default_amount':each.amount_due}).default_get(['journal_id', 'amount'])
                            self.env['pos.make.payment'].with_context({'active_id': each.id, 'ctx_is_postpaid': True}).create(values).check()
    
                        elif each.amount_due >= amount:
                            values = self.env['pos.make.payment'].with_context(
                                {'active_id': each.id, 'default_journal_id': get_journal_id,
                                 'default_amount': amount}).default_get(['journal_id', 'amount'])
                            self.env['pos.make.payment'].with_context({'active_id': each.id, 'ctx_is_postpaid': True}).create(values).check()
                            amount = 0
                            affected_order.append(each.read())
                    else:
                        break
            if amount > 0:
                vals = {
                    'name': pos_session_id,
                    'payment_type': "inbound",
                    'amount': amount,
                    'payment_date': datetime.now().date(),
                    'journal_id': get_journal_id,
                    'payment_method_id': 1,
                    'partner_type': 'customer',
                    'partner_id': partner_id,
                }
                result = account_payment_obj.with_context({'default_from_pos':'credit'}).create(vals)
                result.post()
            res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft')])
            total_amt_due = 0
            for each in res:
                total_amt_due += each.amount_due
            customer = self.env['res.partner'].search([('id', '=', partner_id)])
            form_view_id = self.env.ref('flexibite_com_advance.parnter_payment_tranction_view')
            pos_order_ids = self.env['pos.order'].search([('partner_id', '=', customer.id)])
            statement_ids = self.env['account.bank.statement.line'].search([('partner_id', '=', customer.id), ('is_postpaid', '=', True)])
            order_list_paid = []
            order_list_open = []
            statement_list = []
            for stament_id in statement_ids:
                statement_list.append((0, 0, {
                        'statement_id' : stament_id.id,
                        'name' : stament_id.name,
                        'date' : stament_id.date,
                        'amount' :stament_id.amount
                    }))
            for order in pos_order_ids:
                if order.state == 'paid':
                     order_list_paid.append((0, 0, {
                               'name': order.name,
                               'date_order':order.date_order,
                               'customer_id':order.partner_id.id,
                               'amount_total':order.amount_total,
                               'state':order.state,
                               'pos_order_id':order.id,
                               'partner_payment_id':customer.id,
                               }))
                if order.state == 'draft':
                    order_list_open.append((0, 0, {
                               'name': order.name,
                               'date_order':order.date_order,
                               'customer_id':order.partner_id.id,
                               'amount_total':order.amount_total,
                               'amount_due' : order.amount_due,
                               'state':order.state,
                               'pos_order_id':order.id,
                               'partner_payment_id_open' : customer.id
                               }))
            payment_transaction_id = self.env['partner.payment.transaction'].create({
                'partner_id':customer.id,
                'paid_pos_order__paid_ids':order_list_paid,
                'paid_pos_order_open_ids':order_list_open,
                'partner_statment_ids' : statement_list,
                })
            
            return {
                'res_model': 'partner.payment.transaction',
                'view_type': 'form',
                'view_mode': 'form',
                'name': _('Payment'),
                'views': [(form_view_id.id, 'form')],
                'view_id': form_view_id.id,
                'type': 'ir.actions.act_window',
                'res_id': payment_transaction_id.id,
                'flags': {'form': {'action_buttons': False}}
            }

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
