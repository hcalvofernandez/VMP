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
from odoo.tools import float_is_zero
import sys
import logging

_logger = logging.getLogger('____________________________' + __name__)

class account_journal(models.Model):
    _inherit="account.journal"

    @api.model
    def get_journal_by_code(self, code):
        journal = self.env['account.journal'].search([('code','=',code)], limit=1)
        if(journal):
            return {'_id':journal.id}
        else:
            return False

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        if self._context.get('config_id_cr_dr'):
            config_id = self.env['pos.config'].browse(self._context.get('config_id_cr_dr'))
            args += [['id', 'in', config_id.journal_ids.ids]]
            
        if self._context.get('config_jr'):
            if self._context.get('journal_ids') and \
               self._context.get('journal_ids')[0] and \
               self._context.get('journal_ids')[0][2]:
               args += [['id', 'in', self._context.get('journal_ids')[0][2]]]
            else:
                return False
        if self._context.get('from_delivery'):
            args += [['jr_use_for', '=', False]]
        return super(account_journal, self).name_search(name, args=args, operator=operator, limit=limit)

    shortcut_key = fields.Char('Shortcut Key')
    jr_use_for = fields.Selection([
        ('loyalty', "Loyalty"),
        ('gift_card', "Gift Card"),
        ('gift_voucher', "Gift Voucher"),
        ('rounding', "Rounding")
    ], string="Method Use For",
        help='This payment method reserve for particular feature, that accounting entry will manage based on assigned features.')
    apply_charges = fields.Boolean("Apply Charges")
    fees_amount = fields.Float("Fees Amount")
    fees_type = fields.Selection(selection=[('fixed','Fixed'),('percentage','Percentage')],string="Fees type", default="fixed")
    optional = fields.Boolean("Optional")
    is_online_journal = fields.Boolean(string="Online Journal")
    show_in_pos = fields.Boolean('Show in POS select', default=False)


class CashBoxIn(models.TransientModel):
    _inherit = 'cash.box.in'

    @api.multi
    def _calculate_values_for_statement_line(self, record):
        res = super(CashBoxIn, self)._calculate_values_for_statement_line(record)
        if res:
            res.update({'cash_in': True})
        return res


class CashBoxOut(models.TransientModel):
    _inherit = 'cash.box.out'

    @api.multi
    def _calculate_values_for_statement_line(self, record):
        res = super(CashBoxOut, self)._calculate_values_for_statement_line(record)
        if res:
            res.update({'cash_out': True})
        return res

class AccountBankStatementLine(models.Model):
    _inherit = "account.bank.statement.line"

    cash_in = fields.Boolean(string="Ingresar dinero")
    cash_out = fields.Boolean(string="Sacar dinero")
    is_postpaid = fields.Boolean(string="Is Postpaid")
    is_prepaid = fields.Boolean(string="Is Prepaid")
    order_state = fields.Selection([('draft', 'New'), ('cancel', 'Cancelled'), ('paid', 'Paid'), ('done', 'Posted'), ('done', 'Debited'), ('invoiced', 'Invoiced')],'Status',related="pos_statement_id.state")

    def action_modify_paid_order(self):
        action_id = self.env.ref('flexibite_com_advance.action_wizard_pos_modify_payment_method')
        return {
                    'name': action_id.name,
                    'type': action_id.type,
                    'res_model': action_id.res_model,
                    'view_type': action_id.view_type,
                    'view_id': action_id.view_id.id,
                    'view_mode': action_id.view_mode,
                    'context':{'payment_need_to_remove':self.id},
                    'target': 'new',
                }

    @api.model
    def create(self,vals):
        res = super(AccountBankStatementLine,self).create(vals)
        if self._context.get('ctx_is_postpaid'):
            res.write({'is_postpaid':True})
        if self._context.get('is_prepaid'):
            res.write({'is_prepaid':True})
        return res
 
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
            

class InvoiceInfo(models.Model):
    _inherit = 'account.invoice'

    @api.model
    def get_outstanding_info(self,vals):
        if(vals):
            partner_id = self.env['res.partner'].browse(vals)
            account_id = partner_id.property_account_receivable_id
            comp_id = self.env['res.partner']._find_accounting_partner(partner_id).id
            domain = [('account_id', '=', account_id.id),
                      ('partner_id', '=',  self.env['res.partner']._find_accounting_partner(partner_id).id),
                      ('reconciled', '=', False), '|', ('amount_residual', '!=', 0.0),
                      ('amount_residual_currency', '!=', 0.0)]
            domain.extend([('credit', '>', 0), ('debit', '=', 0)])
            type_payment = _('Outstanding credits')
            lines = self.env['account.move.line'].search(domain)
            info = {'title': '', 'outstanding': True, 'content': [], 'invoice_id': self.id}
            if len(lines) != 0:
                for line in lines:
                    if line.currency_id and line.currency_id == self.currency_id:
                        amount_to_show = abs(line.amount_residual_currency)
                    else:
                        amount_to_show = line.company_id.currency_id.with_context(date=line.date).compute(abs(line.amount_residual), self.currency_id)
                    if float_is_zero(amount_to_show, precision_rounding=self.currency_id.rounding):
                        continue
                    info['content'].append({
                        'journal_name': line.ref or line.move_id.name,
                        'amount': amount_to_show,
                        'id': line.id,
                    })
                info['title'] = type_payment
        return info

    @api.model
    def get_credit_info(self,vals):
        lines_info = []
        move_line_obj = self.env['account.move.line']
        if vals:
            for each in vals:
                if each['partner_id']:
                    partner_id = self.env['res.partner'].browse(each['partner_id'])
                credit_aml = self.env['account.move.line'].browse(each['journal_id'])
                move_line_obj |= credit_aml
                credit_journal_id = credit_aml.journal_id.default_credit_account_id
                debit_account_id = credit_aml.journal_id.default_debit_account_id
                account_id = partner_id.property_account_receivable_id
                lines_info.append((0, 0, {'account_id': account_id.id,
                                           'debit': each['amount'],
                                           'partner_id': partner_id.id,
                                      }))
                lines_info.append((0, 0, {'account_id': credit_journal_id.id,
                                      'credit': each['amount'],
                                      'partner_id': partner_id.id,
                                      }))

                move = self.env['account.move'].create({'ref':'',
                                                    'journal_id':credit_aml.payment_id.journal_id.id,
                                                    'line_ids':lines_info,
                                                    })
                lines_info = []
                line_id = move.line_ids.filtered(lambda l:l.account_id.id==account_id.id and l.partner_id.id == partner_id.id)
                self.env['account.partial.reconcile'].create(
                    {'credit_move_id': credit_aml.id, 'debit_move_id': line_id.id,
                     'amount': line_id.debit,
                     })
                move.post()
        return True


class account_payment(models.Model):
    _inherit = 'account.payment'
    _order = 'id desc'
    es_abono = fields.Boolean(
        string='Es Abono?',
    )
    
    abono_para = fields.Selection(
        string='Abono para',
        selection=[('debit', 'Débito'), ('meal_plan', 'Meal Plan')],
        default="debit"
    )
    pos_session_id = fields.Many2one('pos.session', string="POS Sesion")

    @api.model
    def payment(self, get_journal_id, amount, pos_session_id, partner_id, cashier_id, pay_due):
        account_payment_obj = self.env['account.payment']
        pos_order_obj = self.env['pos.order']
        pos_session = self.env['pos.session']
        affected_order = []
        if pay_due:
            res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft')],order='date_order')
            _order = pos_order_obj.browse(res.id)
            _order.update({'order_type':'Cŕedito'})
            
            for each in res:
                if amount > 0:
                    if each.amount_due < amount:
                        amount -= each.amount_due
                        values = self.env['pos.make.payment'].with_context(
                            {'active_id': each.id, 'default_journal_id': get_journal_id, 'default_amount':each.amount_due}).default_get(['journal_id', 'amount'])
                        self.env['pos.make.payment'].with_context({'active_id': each.id,'ctx_is_postpaid': True}).create(values).check()

                    elif each.amount_due >= amount:
                        values = self.env['pos.make.payment'].with_context(
                            {'active_id': each.id, 'default_journal_id': get_journal_id,
                             'default_amount': amount}).default_get(['journal_id', 'amount'])
                        self.env['pos.make.payment'].with_context({'active_id': each.id,'ctx_is_postpaid': True}).create(values).check()
                        amount = 0
                        affected_order.append(each.read())
                else:
                    break
        pos_session_id = pos_session.sudo().search([('name', '=', pos_session_id)])

        if amount > 0:
            vals = {
                        'name': pos_session_id.name or '',
                        'pos_session_id': pos_session_id.id,
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
        
        return {'amount_due':total_amt_due,'credit_bal':customer.remaining_credit_amount,'affected_order':affected_order}

    @api.model
    def payment_debit(self, get_journal_id, amount, pos_session_id, partner_id, cashier_id, pay_due,order_ref):
        account_payment_obj = self.env['account.payment']
        pos_order_obj = self.env['pos.order']
        pos_session = self.env['pos.session']
        affected_order = []
        if pay_due:
            #, ('pos_reference', '=', order_ref)
            res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft'),('pos_reference', '=', order_ref)],order='date_order')
            _order = pos_order_obj.browse(res.id)
            _order.update({'order_type':'Débito'})

            for each in res:
                _order = pos_order_obj.browse(each.id)
                _order.sudo().update({'is_debit':True})
                if amount > 0:
                    if each.amount_due < amount:
                        amount -= each.amount_due
                        values = self.env['pos.make.payment'].with_context(
                            {'active_id': each.id, 'default_journal_id': get_journal_id, 'default_amount':each.amount_due}).default_get(['journal_id', 'amount'])
                        self.env['pos.make.payment'].with_context({'active_id': each.id,'ctx_is_prepaid': True}).create(values).check()

                    elif each.amount_due >= amount:
                        values = self.env['pos.make.payment'].with_context(
                            {'active_id': each.id, 'default_journal_id': get_journal_id,
                            'default_amount': amount}).default_get(['journal_id', 'amount'])
                        self.env['pos.make.payment'].with_context({'active_id': each.id,'ctx_is_prepaid': True}).create(values).check()
                        amount = 0
                        affected_order.append(each.read())
                else:
                    break
        pos_session_id = pos_session.sudo().search([('name', '=', pos_session_id)])

        if amount > 0:
            vals = {
                        'es_abono': False,
                        'abono_para': 'debit',
                        'name': pos_session_id.name,
                        'pos_session_id': pos_session_id.id,
                        'payment_type': "inbound",
                        'amount': amount,
                        'payment_date': datetime.now().date(),
                        'fecha_pago': datetime.now().date(),
                        'journal_id': get_journal_id,
                        'payment_method_id': 1,
                        'partner_type': 'customer',
                        'partner_id': partner_id,
                    }
            result = account_payment_obj.with_context({'default_from_pos':'debit'}).create(vals)
            result.post()
            partner = self.env['res.partner'].browse(result.partner_id.id)
            new_debit_limit = float(result.partner_id.debit_limit) - float(result.amount)
            partner.update({'debit_limit':new_debit_limit})

        res = pos_order_obj.search([('pos_reference', '=', order_ref)])
        total_amt_due = 0

        for each in res:
            total_amt_due += each.amount_due
        customer = self.env['res.partner'].search([('id', '=', partner_id)])
        return {'amount_due':total_amt_due,'debit_bal':customer.remaining_debit_amount,'affected_order':affected_order}
    
    @api.model
    def payment_meal_plan(self, get_journal_id, amount, pos_session_id, partner_id, cashier_id, pay_due,order_ref):
        account_payment_obj = self.env['account.payment']
        pos_order_obj = self.env['pos.order']
        pos_session = self.env['pos.session']
        affected_order = []
        if pay_due:
            #, ('pos_reference', '=', order_ref)
            res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft'),('pos_reference', '=', order_ref)],order='date_order')
            _order = pos_order_obj.browse(res.id)
            _order.update({'order_type':'Meal Plan'})
            for each in res:
                _order = pos_order_obj.browse(each.id)
                _order.sudo().update({'is_meal_plan':True})
                if amount > 0:
                    if each.amount_due < amount:
                        amount -= each.amount_due
                        values = self.env['pos.make.payment'].with_context(
                            {'active_id': each.id, 'default_journal_id': get_journal_id, 'default_amount':each.amount_due}).default_get(['journal_id', 'amount'])
                        self.env['pos.make.payment'].with_context({'active_id': each.id,'ctx_is_meal_plan': True}).create(values).check()

                    elif each.amount_due >= amount:
                        values = self.env['pos.make.payment'].with_context(
                            {'active_id': each.id, 'default_journal_id': get_journal_id,
                             'default_amount': amount}).default_get(['journal_id', 'amount'])
                        self.env['pos.make.payment'].with_context({'active_id': each.id,'ctx_is_meal_plan': True}).create(values).check()
                        amount = 0
                        affected_order.append(each.read())
                else:
                    break
        pos_session_id = pos_session.sudo().search([('name', '=', pos_session_id)])

        if amount > 0:
            vals = {
                        'es_abono': False,
                        'abono_para': 'meal_plan',
                        'name': pos_session_id.name,
                        'pos_session_id': pos_session_id.id,
                        'payment_type': "inbound",
                        'amount': amount,
                        'payment_date': datetime.now().date(),
                        'fecha_pago': datetime.now().date(),
                        'journal_id': get_journal_id,
                        'payment_method_id': 1,
                        'partner_type': 'customer',
                        'partner_id': partner_id,
                    }
            result = account_payment_obj.with_context({'default_from_pos':'meal_plan'}).create(vals)
            result.post()
            partner = self.env['res.partner'].browse(result.partner_id.id)
            new_meal_plan_limit = float(result.partner_id.meal_plan_limit) - float(amount)
            partner.sudo().update({'meal_plan_limit':new_meal_plan_limit})

        res = pos_order_obj.search([('pos_reference', '=', order_ref)])
        total_amt_due = 0

        for each in res:
            total_amt_due += each.amount_due
        customer = self.env['res.partner'].search([('id', '=', partner_id)])
        return {'amount_due':total_amt_due,'meal_plan_bal':customer.remaining_meal_plan_limit,'affected_order':affected_order}
    

    @api.model
    def payment_credit(self, get_journal_id, amount, pos_session_id, partner_id, cashier_id, pay_due,order_ref):
        order = self.env['pos.order'].search([('partner_id', '=', partner_id), ('state', '=', 'draft'),('pos_reference', '=', order_ref)],order='date_order')
        objorder = self.env['pos.order'].search([('partner_id', '=', partner_id), ('pos_reference', '=', order_ref)])

        order_update = self.env['pos.order'].browse(order.id)
        order_update.sudo().update({'is_postpaid':True,'order_type':'Cŕedito', 'state_order_fac': 'n'})
        customer = self.env['res.partner'].browse(partner_id)
        
        res = self.env['pos.order'].search([('partner_id', '=', partner_id), ('state', '=', 'draft')])

        total_amt_due = 0
        
        for each in res:
            total_amt_due += each.amount_due


        response =  {'amount_due':total_amt_due,'customer':customer.id,'credit_bal':customer.remaining_credit_amount,'credit_limit':customer.credit_limit,'affected_order':order_update.read()}

        try:
            account_payment_obj = self.env['account.payment']
            pos_order_obj = self.env['pos.order']
            affected_order = []
            if pay_due:
                #, ('pos_reference', '=', order_ref)
                res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft'),('pos_reference', '=', order_ref)],order='date_order')

                for each in res:
                    if amount > 0:
                        if each.amount_due < amount:
                            _logger.info("AMOUNT DUE < AMOUNT %s" % (res))
                            amount -= each.amount_due
                            values = self.env['pos.make.payment'].with_context(
                                {'active_id': each.id, 'default_journal_id': get_journal_id, 'default_amount':each.amount_due}).default_get(['journal_id', 'amount'])
                            self.env['pos.make.payment'].with_context({'active_id': each.id,'ctx_is_postpaid': True}).sudo().create(values).check()
                            affected_order.append(each.read())
                        elif each.amount_due >= amount:
                            _logger.info("AMOUNTaffected_order DUE >= AMOUNT %s" % (response))
                            values = self.env['pos.make.payment'].with_context(
                                {'active_id': each.id, 'default_journal_id': get_journal_id,
                                'default_amount': amount}).default_get(['journal_id', 'amount'])
                            self.env['pos.make.payment'].with_context({'active_id': each.id,'ctx_is_postpaid': True}).sudo().create(values).check()
                            amount = 0
                            affected_order.append(each.read())
                    else:
                        _logger.info("ELSE ")
                        break
            if amount > 0:
                vals = {
                            'es_abono': False,
                            'name': pos_session_id,
                            'payment_type': "inbound",
                            'amount': amount,
                            'payment_date': datetime.now().date(),
                            'fecha_pago': datetime.now().date(),
                            'journal_id': get_journal_id,
                            'payment_method_id': 1,
                            'partner_type': 'customer',
                            'partner_id': partner_id,
                        }
                result = account_payment_obj.with_context({'default_from_pos':'credit'}).create(vals)
                result.post()
                #partner = self.env['res.partner'].browse(result.partner_id.id)
                #new_credit_limit = float(result.partner_id.credit_limit) - float(result.amount)
                #partner.update({'credit_limit':new_credit_limit})

            res = pos_order_obj.search([('partner_id', '=', partner_id), ('state', '=', 'draft')])
            total_amt_due = 0
            
            for each in res:
                total_amt_due += each.amount_due
            customer = self.env['res.partner'].browse(partner_id)

            return response

        except Exception as e:
            exc_traceback = sys.exc_info()
            raise Warning(getattr(e, 'message', repr(e))+" ON LINE "+format(sys.exc_info()[-1].tb_lineno))
    
    @api.model
    def create(self, vals):
        recent_payment = super(account_payment, self).create(vals)
        if(recent_payment):
            if(recent_payment.es_abono):
                partner = self.env['res.partner'].browse(recent_payment.partner_id.id)

                if(recent_payment.abono_para=='debit'):
                    new_debit_limit = float(recent_payment.partner_id.debit_limit) + float(recent_payment.amount)
                    partner.update({'debit_limit':new_debit_limit})
                elif(recent_payment.abono_para=='meal_plan'):
                    new_meal_limit = float(recent_payment.partner_id.meal_plan_limit) + float(recent_payment.amount)
                    partner.update({'meal_plan_limit':new_meal_limit})

        return recent_payment
    
    @api.model
    def increase_customer_debit(self, get_journal_id, amount, pos_session_id, partner_id, cashier_id, pay_due, abono_para="debit"):
        pos_session = self.env['pos.session']
        pos_session_id = pos_session.sudo().search([('name', '=', pos_session_id)])
        new_payment = self.env['account.payment'].sudo().create({     
                                                                    'es_abono':True,
                                                                    'abono_para':abono_para,
                                                                    'payment_type':'inbound',
                                                                    'pos_session_id': pos_session_id.id,
                                                                    'name': str("Abono - ") + pos_session_id.name,
                                                                    'payment_date': datetime.now().date(),
                                                                    'fecha_pago': datetime.now().date(),
                                                                    'journal_id': get_journal_id,
                                                                    'payment_method_id': 1,
                                                                    'partner_type': 'customer',
                                                                    'partner_id': partner_id,
                                                                    'amount': amount,
                                                                    'state': 'posted',
                                                                })
        customer = self.env['res.partner'].search([('id', '=', partner_id)],limit=1)
        return {'debit_limit':customer.debit_limit,'remaining_debit_amount':customer.remaining_debit_amount}
 
    @api.model
    def increase_customer_meal_plan(self, get_journal_id, amount, pos_session_id, partner_id, cashier_id, pay_due, abono_para="meal_plan"):
        pos_session = self.env['pos.session']
        pos_session_id = pos_session.sudo().search([('name', '=', pos_session_id)])
        new_payment = self.env['account.payment'].sudo().create({     
                                                                    'es_abono':True,
                                                                    'abono_para':abono_para,
                                                                    'payment_type':'inbound',
                                                                    'name': str("Abono - ") + pos_session_id.name,
                                                                    'pos_session_id': pos_session_id.id,
                                                                    'payment_date': datetime.now().date(),
                                                                    'fecha_pago': datetime.now().date(),
                                                                    'journal_id': get_journal_id,
                                                                    'payment_method_id': 1,
                                                                    'partner_type': 'customer',
                                                                    'partner_id': partner_id,
                                                                    'amount': amount,
                                                                    'state': 'posted',
                                                                })
        customer = self.env['res.partner'].search([('id', '=', partner_id)],limit=1)
        return {'meal_plan_limit':customer.meal_plan_limit,'remaining_meal_plan_limit':customer.remaining_meal_plan_limit}

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
