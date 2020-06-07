# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models
from odoo.exceptions import UserError
import json
_logger = logging.getLogger("_______________________________________" + __name__)


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.depends('order_ids', 'cash_register_balance_start', 'cash_register_id', 'cash_register_tip')
    def _compute_cash_balance(self):
        #res = super(PosSession, self)._compute_cash_balance()
        for session in self:
            cash_register_tip = sum(session.order_ids.mapped('lines').filtered(lambda line: line.product_id.id==1).mapped('price_subtotal'))
            session.cash_register_tip = cash_register_tip
            session.cash_register_balance_end = session.cash_register_balance_start + session.cash_register_total_entry_encoding - cash_register_tip
            session.cash_register_difference = session.cash_register_balance_end_real - session.cash_register_balance_end

    @api.depends('cash_register_total_entry_encoding')
    def _compute_cash_control(self):
        for session in self:
            statement_ids = session.sudo().statement_ids.filtered(lambda st: st.journal_id.sudo().name == 'Efectivo')
            vals = {}
            for cash in statement_ids:
                negative_amount = cash.mapped('line_ids').filtered(lambda l: l.amount < 0)
                positive_amount = cash.mapped('line_ids').filtered(lambda l: l.amount > 0)
                currency_id = cash.company_id.currency_id
                dif_ncash = currency_id.round(sum(negative_amount.mapped('amount')))
                dif_pcash = currency_id.round(sum(positive_amount.mapped('amount')))
                ventas_efectivo = currency_id.round(session.cash_register_balance_end)
                ingresos_efectivo = dif_pcash
                retiros_efectivo = dif_ncash
                balance_start = currency_id.round(session.cash_register_balance_start)
                vals = {
                    'balance_start': balance_start,
                    'currency': currency_id.symbol,
                    'digits': [69, currency_id.decimal_places],
                    'ventas':   ventas_efectivo,
                    'ingresos': ingresos_efectivo,
                    'retiros':  retiros_efectivo,
                    'transacciones': balance_start + ventas_efectivo + ingresos_efectivo + retiros_efectivo
                }
            session.cash_control_widget = json.dumps(vals)

    def _compute_payments(self):
        list_payment = []
        for session in self:
            AccountPaymentObj = self.env['account.payment']
            journals = self.env['account.journal'].sudo().search([])
            domain = [('journal_id', 'in', journals.ids), ('es_abono', '=', True), ('abono_para', '=', 'debit')]
            payments = AccountPaymentObj.sudo().search(domain)
            session.payment_lines = payments
            pays = AccountPaymentObj.sudo().read_group(domain, ['journal_id', 'partner_id', 'amount'], ['journal_id'])
            partner_id = payments.mapped('partner_id')
            amount = payments.mapped('amount')
            journal_id = payments.mapped('journal_id')
            msg = ''
            for p in pays:
                msg += "%s %s \n" % (p['journal_id'][1], p['amount'])
            
            session.abono_total_debito = msg

    @api.depends('statement_ids.journal_id')
    def _compute_debit_widget(self):
        values = {}
        for session in self:
            AccountPayment = self.env['account.payment']
            journal_id = session.mapped('statement_ids.journal_id')
            payment_debit = AccountPayment.sudo().search([('journal_id', 'in', journal_id.ids), ('es_abono', '=', True), ('abono_para', '=', 'debit'), ('pos_session_id', '=', session.id)])
            currency_id = session.currency_id
            values.update({
                'journal_id': payment_debit.mapped('journal_id.display_name'),
                'amount': currency_id.round(sum(payment_debit.mapped('amount'))),
                'currency': currency_id.symbol,
                'digits': [69, currency_id.decimal_places],
            })
            _logger.info(values)
            session.payment_debit_widget = json.dumps(values)

    cash_register_tip = fields.Monetary(
        compute='_compute_cash_balance',
        string="- Propinas pagadas",
        help="Total de propinas pagadas",
        readonly=True
    )
    payment_debit_widget = fields.Text(string="Abonos a débito", compute="_compute_debit_widget")
    payment_lines = fields.One2many('account.payment', 'pos_session_id', string='Pagos', compute='_compute_payments')
    abono_total_debito = fields.Text(string="Abono", compute='_compute_payments')
    cash_control_widget = fields.Text(string="Resumen Diario de Efectivo", compute="_compute_cash_control")

    @api.multi
    def open_report_x(self):
        context = dict(
            default_session_ids=self.ids
        )
        return {
            'name': _('Report X'),
            'type': 'ir.actions.act_window',
            'view_type': 'form',
            'view_mode': 'form',
            'res_model': 'wizard.pos.x.report',
            #'views': [(self.env.ref('flexibite_com_advance.action_wizard_pos_x_report').id, 'form')],
            #'view_id': compose_form.id,
            'target': 'new',
            'context': context
        }


    @api.multi
    def open_report_z(self):
        context = dict(
            default_session_ids=self.ids
        )
        return {
            'name': _('Report Z'),
            'type': 'ir.actions.act_window',
            'view_type': 'form',
            'view_mode': 'form',
            'res_model': 'wizard.pos.sale.report',
            # 'views': [(self.env.ref('flexibite_com_advance.action_wizard_pos_x_report').id, 'form')],
            # 'view_id': compose_form.id,
            'target': 'new',
            'context': context,
        }