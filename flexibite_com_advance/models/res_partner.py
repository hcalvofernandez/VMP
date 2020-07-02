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
from odoo.tools.safe_eval import safe_eval

import logging

_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _calc_limit(self):
        for partner in self:
            contract_obj = self.env['contract.contract']
            contract = contract_obj.search([('partner_id', '=', partner.id)])
            partner.credit_limit = contract.limit_credit
            partner.meal_plan_limit = contract.meal_plan_credit

    @api.multi
    def write(self, vals):
        res = super(ResPartner, self).write(vals)
        return res

    @api.multi
    @api.depends('pos_order_ids.amount_total', 'meal_plan_limit')
    def _calc_meal_plan_remaining(self):
        for partner in self:
            pos_orders = partner.pos_order_ids.filtered(lambda r: r.state == 'paid' and 'is_meal_plan' is True)
            amount = sum([order.amount_total for order in pos_orders]) or 0.00
            partner.remaining_meal_plan_limit = partner.meal_plan_limit - amount

    @api.model
    def get_partner_data(self, id_, amount):
        partner = self.sudo().browse(id_)
        remaining_credit_amount = float(partner.credit_limit) - (float(self.get_remaining_credit_amount(partner)) + float(amount))
        return {'credit_limit'             : partner.credit_limit, 'remaining_credit_amount': remaining_credit_amount,
                'remaining_meal_plan_limit': partner.remaining_meal_plan_limit
        }

    @api.multi
    def get_remaining_credit_amount(self, partner):
        orders = partner.pos_order_ids.filtered(lambda r: r.state == 'draft' and 'is_postpaid' is True)
        total = 0.0
        account_journal = self.env['account.journal'].search([('code','=','POSCR')],limit=1)
        for order in orders:
             for statment in order.statement_ids:
                    _logger.warning(str(account_journal.id) + str(" *-* ") + str(statment.journal_id.id))
                    if(int(account_journal.id) == int(statment.journal_id.id)):
                        total = total + float(statment.amount)
                        _logger.warning(total)
        try:
            partner.remaining_credit_amount = total
            if(partner.remaining_credit_limit<0):
                    partner.remaining_credit_limit = 0
                #total = total + float(order.amount_total)
        except:
            pass
        return total

    def action_view_partner_invoices_postpago(self):
        return {'name'   : _('Pedidos a Cŕedito'), 'view_type': 'form', 'view_mode': 'tree',
                'view_id': self.env.ref('point_of_sale.view_pos_order_tree').id, 'res_model': 'pos.order',
                'type'   : 'ir.actions.act_window', 'target': 'current',
                'domain' : [('is_postpaid', '=', True), ('partner_id', '=', self.id)]
        }

    def action_view_partner_invoices_prepaid(self):
        return {'name'   : _('Pedidos Débitados'), 'view_type': 'form', 'view_mode': 'tree',
                'view_id': self.env.ref('point_of_sale.view_pos_order_tree').id, 'res_model': 'pos.order',
                'type'   : 'ir.actions.act_window', 'target': 'current',
                'domain' : [('is_debit', '=', True), ('partner_id', '=', self.id)]
        }

    def action_view_partner_invoices_mealplan(self):
        return {'name'   : _('Pedidos Meal Plan'), 'view_type': 'form', 'view_mode': 'tree',
                'view_id': self.env.ref('point_of_sale.view_pos_order_tree').id, 'res_model': 'pos.order',
                'type'   : 'ir.actions.act_window', 'target': 'current',
                'domain' : [('is_meal_plan', '=', True), ('partner_id', '=', self.id)]
        }

    @api.model
    def calculate_partner(self, fields):
        return self.env['res.partner'].search_read([('customer', '=', True)], safe_eval(fields))

    @api.model
    def create_partner(self, partner_info):
        partner_id = self.create({
            'name'  : partner_info.get('cust_name'),
            'email' : partner_info.get('cust_email'),
            'mobile': partner_info.get('cust_mobile'),
        })
        partner = self.search_read([('id', '=', partner_id.id)], partner_info.get('fields'))
        if partner:
            return partner
        else:
            return False

    @api.multi
    @api.depends('card_ids.card_value')
    def compute_amount(self):
        for ids in self:
            total_amount = 0
            for card_id in ids.card_ids:
                total_amount += card_id.card_value
            ids.remaining_amount = total_amount

    @api.multi
    def get_transaction(self):
        form_view_id = self.env.ref('flexibite_com_advance.parnter_payment_tranction_view')
        pos_order_ids = self.env['pos.order'].search([('partner_id', '=', self.id)])
        statement_ids = self.env['account.bank.statement.line'].search(
            [('partner_id', '=', self.id), ('is_postpaid', '=', True)])
        order_list_paid = []
        order_list_open = []
        statement_list = []
        for stament_id in statement_ids:
            statement_list.append((0, 0, {
                'statement_id': stament_id.id,
                'name'        : stament_id.name,
                'date'        : stament_id.date,
                'amount'      : stament_id.amount
            }))
        for order in pos_order_ids:
            if order.state == 'paid':
                order_list_paid.append((0, 0, {
                    'name'              : order.name,
                    'date_order'        : order.date_order,
                    'customer_id'       : order.partner_id.id,
                    'amount_total'      : order.amount_total,
                    'state'             : order.state,
                    'pos_order_id'      : order.id,
                    'partner_payment_id': self.id,
                }))
            if order.state == 'draft' and order.is_debit:
                order_list_open.append((0, 0, {
                    'name'                   : order.name,
                    'date_order'             : order.date_order,
                    'customer_id'            : order.partner_id.id,
                    'amount_total'           : order.amount_total,
                    'amount_due'             : order.amount_due,
                    'state'                  : order.state,
                    'pos_order_id'           : order.id,
                    'partner_payment_id_open': self.id
                }))

        return {
            'res_model': 'partner.payment.transaction',
            'view_type': 'form',
            'view_mode': 'form',
            'name'     : _('Payment'),
            'views'    : [(form_view_id.id, 'form')],
            'view_id'  : form_view_id.id,
            'context'  : {
                'default_partner_id'             : self.id, 'default_paid_pos_order__paid_ids': order_list_paid,
                'default_paid_pos_order_open_ids': order_list_open, 'default_partner_statment_ids': statement_list
            },
            'type'     : 'ir.actions.act_window',
        }

    @api.multi
    @api.depends('wallet_lines.credit', 'wallet_lines.debit')
    def _calc_remaining(self):
        for s in self:
            total = 0.00
            for line in s.wallet_lines:
                total += line.credit - line.debit
            s.remaining_wallet_amount = total

    @api.multi
    @api.depends('pos_order_ids.amount_total', 'debit_limit')
    def _calc_debit_remaining(self):
        for partner in self:
            pos_orders = partner.pos_order_ids.filtered(lambda r: r.state == 'paid' and r.is_debit is True)
            amount = sum([order.amount_total for order in pos_orders]) or 0.00
            partner.remaining_debit_amount = partner.debit_limit - amount

    @api.model
    def loyalty_reminder(self):
        partner_ids = self.search([('email', "!=", False), ('send_loyalty_mail', '=', True)])
        for partner_id in partner_ids.filtered(lambda partner: partner.remaining_loyalty_points > 0):
            try:
                template_id = self.env['ir.model.data'].get_object_reference('flexibite_com_advance',
                                                                             'email_template_loyalty_reminder')
                template_obj = self.env['mail.template'].browse(template_id[1])
                template_obj.send_mail(partner_id.id, force_send=True, raise_exception=True)
            except Exception as e:
                _logger.error('Unable to send email for order %s', e)

    @api.multi
    @api.depends('loyalty_ids.points')
    def _calculate_earned_loyalty_points(self):
        for partner in self:
            total_earned_points = 0.00
            for earned_loyalty in partner.loyalty_ids:
                total_earned_points += earned_loyalty.points
            partner.loyalty_points_earned = total_earned_points

    @api.multi
    @api.depends('loyalty_ids.points', 'loyalty_ids.amount_total', 'loyalty_point_redeem_ids.redeemed_point', 'loyalty_point_redeem_ids.redeemed_amount_total')
    def _calculate_remaining_loyalty(self):
        for partner in self.sudo():
            points_earned = 0.00
            amount_earned = 0.00
            points_redeemed = 0.00
            amount_redeemed = 0.00
            for earned_loyalty in partner.loyalty_ids:
                points_earned += earned_loyalty.points
                amount_earned += earned_loyalty.amount_total
            for redeemed_loyalty in partner.loyalty_point_redeem_ids:
                points_redeemed += redeemed_loyalty.redeemed_point
                amount_redeemed += redeemed_loyalty.redeemed_amount_total
            partner.total_remaining_points = points_earned - points_redeemed
            partner.remaining_loyalty_points = points_earned - points_redeemed
            partner.remaining_loyalty_amount = amount_earned - amount_redeemed

    meal_plan_limit = fields.Float(string='Meal Plan Limite')
    debit_limit = fields.Float("Limite de Credito")
    credit_limit = fields.Float("Crédito límite")
    card_ids = fields.One2many('aspl.gift.card', 'customer_id', string="List of card")
    used_ids = fields.One2many('aspl.gift.card.use', 'customer_id', string="List of used card")
    recharged_ids = fields.One2many('aspl.gift.card.recharge', 'customer_id', string="List of recharged card")
    wallet_lines = fields.One2many('wallet.management', 'customer_id', string="Wallet", readonly=True)
    exchange_history_ids = fields.One2many('aspl.gift.card.exchange.history', 'customer_id')
    send_loyalty_mail = fields.Boolean("Send Loyalty Mail", default=True)
    total_remaining_points = fields.Float("Total Loyalty Points", readonly=1)
    loyalty_ids = fields.One2many(comodel_name="loyalty.point", inverse_name="partner_id", string="Loyalty", required=False, )
    loyalty_point_redeem_ids = fields.One2many(comodel_name="loyalty.point.redeem", inverse_name="partner_id", string="Loyalty Points", required=False, )
    prefer_ereceipt = fields.Boolean('Prefer E-Receipt')


    # Campos calculados
    remaining_amount = fields.Char(compute="compute_amount", string="Remaining Amount", readonly=True, store=True)
    remaining_wallet_amount = fields.Float(compute="_calc_remaining", string="Remaining Wallet Amount", readonly=True,
                                           store=True)
    remaining_debit_amount = fields.Float(compute="_calc_debit_remaining", string="Credito Disponible", readonly=True,
                                          store=True)
    remaining_meal_plan_limit = fields.Float(compute="_calc_meal_plan_remaining", string="Credito Disponible",
                                             store=True, readonly=True)

    remaining_loyalty_points = fields.Float("Remaining Loyalty Points", readonly=1, compute='_calculate_remaining_loyalty', store=True)
    remaining_loyalty_amount = fields.Float("Points to Amount", readonly=1, compute='_calculate_remaining_loyalty', store=True)

    loyalty_points_earned = fields.Float(compute='_calculate_earned_loyalty_points', store=True)

class partner_payment_transaction(models.TransientModel):
    _name = 'partner.payment.transaction'
    _rec_name = 'partner_id'
    _description = 'partner.payment.transaction'

    partner_id = fields.Many2one('res.partner', string='Partner')
    paid_pos_order__paid_ids = fields.One2many('pos.order.details', 'partner_payment_id', string='Pos Orders')
    paid_pos_order_open_ids = fields.One2many('pos.order.details', 'partner_payment_id_open', string='Pos Order(s)', )
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
            'name'     : _('Payment'),
            'views'    : [(form_view_id.id, 'form')],
            'target'   : 'new',
            'view_id'  : form_view_id.id,
            'context'  : {
                'default_amount_due': due_amount,
                'partner_id'        : self.partner_id.id
            },
            'type'     : 'ir.actions.act_window',
        }


class pos_order_details(models.TransientModel):
    _name = 'pos.order.details'
    _description = 'pos.order.details'

    partner_payment_id = fields.Many2one('partner.payment.transaction', string='Payment')
    partner_payment_id_open = fields.Many2one('partner.payment.transaction', string='Partner Payment')
    pos_order_id = fields.Many2one('pos.order', string='Pos Order')
    name = fields.Char(string='Nombre', )
    date_order = fields.Char(string='Fecha')
    amount_due = fields.Float(string='Monto')
    customer_id = fields.Many2one('res.partner', string='Cliente', )
    amount_total = fields.Float(string='Total', )
    state = fields.Selection(
        [('draft', 'New'), ('cancel', 'Cancelled'), ('paid', 'Paid'), ('done', 'Posted'), ('invoiced', 'Invoiced')],
        string='Status', )


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
                res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft')],
                                           order='date_order')
                for each in res:
                    if amount > 0:
                        if each.amount_due < amount:
                            amount -= each.amount_due
                            values = self.env['pos.make.payment'].with_context(
                                {'active_id'     : each.id, 'default_journal_id': get_journal_id,
                                 'default_amount': each.amount_due
                                }).default_get(['journal_id', 'amount'])
                            self.env['pos.make.payment'].with_context(
                                {'active_id': each.id, 'ctx_is_postpaid': True}).create(values).check()

                        elif each.amount_due >= amount:
                            values = self.env['pos.make.payment'].with_context(
                                {
                                    'active_id'     : each.id, 'default_journal_id': get_journal_id,
                                    'default_amount': amount
                                }).default_get(['journal_id', 'amount'])
                            self.env['pos.make.payment'].with_context(
                                {'active_id': each.id, 'ctx_is_postpaid': True}).create(values).check()
                            amount = 0
                            affected_order.append(each.read())
                    else:
                        break
            if amount > 0:
                vals = {
                    'name'             : pos_session_id,
                    'payment_type'     : "inbound",
                    'amount'           : amount,
                    'payment_date'     : datetime.now().date(),
                    'journal_id'       : get_journal_id,
                    'payment_method_id': 1,
                    'partner_type'     : 'customer',
                    'partner_id'       : partner_id,
                }
                result = account_payment_obj.with_context({'default_from_pos': 'credit'}).create(vals)
                result.post()
            res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft')])
            total_amt_due = 0
            for each in res:
                total_amt_due += each.amount_due
            customer = self.env['res.partner'].search([('id', '=', partner_id)])
            form_view_id = self.env.ref('flexibite_com_advance.parnter_payment_tranction_view')
            pos_order_ids = self.env['pos.order'].search([('partner_id', '=', customer.id)])
            statement_ids = self.env['account.bank.statement.line'].search(
                [('partner_id', '=', customer.id), ('is_postpaid', '=', True)])
            order_list_paid = []
            order_list_open = []
            statement_list = []
            for stament_id in statement_ids:
                statement_list.append((0, 0, {
                    'statement_id': stament_id.id,
                    'name'        : stament_id.name,
                    'date'        : stament_id.date,
                    'amount'      : stament_id.amount
                }))
            for order in pos_order_ids:
                if order.state == 'paid':
                    order_list_paid.append((0, 0, {
                        'name'              : order.name,
                        'date_order'        : order.date_order,
                        'customer_id'       : order.partner_id.id,
                        'amount_total'      : order.amount_total,
                        'state'             : order.state,
                        'pos_order_id'      : order.id,
                        'partner_payment_id': customer.id,
                    }))
                if order.state == 'draft':
                    order_list_open.append((0, 0, {
                        'name'                   : order.name,
                        'date_order'             : order.date_order,
                        'customer_id'            : order.partner_id.id,
                        'amount_total'           : order.amount_total,
                        'amount_due'             : order.amount_due,
                        'state'                  : order.state,
                        'pos_order_id'           : order.id,
                        'partner_payment_id_open': customer.id
                    }))
            payment_transaction_id = self.env['partner.payment.transaction'].create({
                'partner_id'              : customer.id,
                'paid_pos_order__paid_ids': order_list_paid,
                'paid_pos_order_open_ids' : order_list_open,
                'partner_statment_ids'    : statement_list,
            })

            return {
                'res_model': 'partner.payment.transaction',
                'view_type': 'form',
                'view_mode': 'form',
                'name'     : _('Payment'),
                'views'    : [(form_view_id.id, 'form')],
                'view_id'  : form_view_id.id,
                'type'     : 'ir.actions.act_window',
                'res_id'   : payment_transaction_id.id,
                'flags'    : {'form': {'action_buttons': False}}
            }

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
