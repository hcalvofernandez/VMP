# -*- coding: utf-8 -*-

from odoo.tools.misc import formatLang

from odoo import models, fields, api, _
from odoo.exceptions import UserError


class AccountBankStatement (models.Model):
    _inherit = 'account.bank.statement'

    @api.multi
    def _balance_check(self):
        for stmt in self:
            if not stmt.currency_id.is_zero(stmt.difference):
                if stmt.journal_type == 'cash':
                    if stmt.difference < 0.0:
                        account = stmt.journal_id.loss_account_id
                        name = _('Loss')
                    else:
                        # statement.difference > 0.0
                        account = stmt.journal_id.profit_account_id
                        name = _('Profit')
                    if not account:
                        raise UserError(
                            _('There is no account defined on the journal %s for %s involved in a cash difference.') % (
                            stmt.journal_id.name, name))

                    values = {
                        'statement_id': stmt.id,
                        'account_id': account.id,
                        'amount': stmt.difference,
                        'name': _("Cash difference observed during the counting (%s)") % name,
                        'oar_type': 'origin',
                    }
                    self.env['account.bank.statement.line'].create(values)
                else:
                    balance_end_real = formatLang(self.env, stmt.balance_end_real, currency_obj=stmt.currency_id)
                    balance_end = formatLang(self.env, stmt.balance_end, currency_obj=stmt.currency_id)
                    raise UserError(_(
                        'The ending balance is incorrect !\nThe expected balance (%s) is different from the computed one. (%s)')
                                    % (balance_end_real, balance_end))
        return True


class AccountBankStatementLine(models.Model):
    _inherit = "account.bank.statement.line"

    oar_type = fields.Selection([('origin', "Origin"), ('application', "Application"), ('liquidation', 'Liquidation')])

    def _prepare_reconciliation_move(self, move_ref):
        """ Prepare the dict of values to create the move from a statement line. This method may be overridden to adapt domain logic
            through model inheritance (make sure to call super() to establish a clean extension chain).

           :param char move_ref: will be used as the reference of the generated account move
           :return: dict of value to create() the account.move
        """
        data = super(AccountBankStatementLine, self)._prepare_reconciliation_move(move_ref)
        if self.oar_type:
            data['oar_type'] = self.oar_type
        return data
