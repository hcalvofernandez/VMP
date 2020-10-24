# -*- coding: utf-8 -*-

from odoo import models, fields, api


class AccountBankStatement(models.Model):
    _inherit = 'account.bank.statement'

    uncashed_total_entry_encoding = fields.Monetary(
        'Subtotal de Transacciones', compute='_uncashed_end_balance', store=False,
    )
    uncashed_balance_end = fields.Monetary(
        'Computed Balance', compute='_uncashed_end_balance', store=False,
    )
    uncashed_balance_end_real = fields.Monetary(
        'Balance Final',
        compute='_uncashed_end_balance', store=False,
    )
    uncashed_difference = fields.Monetary(
        'Diferencia',
        compute='_uncashed_end_balance', store=False,
    )

    @api.depends('line_ids', 'balance_start', 'line_ids.amount')
    def _uncashed_end_balance(self):
        for statement in self:
            if statement.journal_id.name == statement.pos_session_id.cash_journal_id.name:
                statement.uncashed_total_entry_encoding = sum(
                    [
                        line.amount
                        for line in statement.line_ids
                        if 'ret' not in line.name.lower()
                        and 'diferencia' not in line.name.lower()
                    ]
                )
                statement.uncashed_balance_end_real = sum(
                    cash_line.subtotal
                    for cash_line in statement.pos_session_id.cashcontrol_ids
                )
                statement.uncashed_balance_end = statement.balance_start + statement.uncashed_total_entry_encoding
                statement.uncashed_difference = (
                        statement.uncashed_total_entry_encoding - statement.balance_end_real_declared
                )
            else:
                statement.uncashed_total_entry_encoding = statement.total_entry_encoding
                statement.uncashed_balance_end = statement.balance_end
                statement.uncashed_balance_end_real = statement.balance_end_real
                statement.uncashed_difference = statement.difference_custom


