# -*- coding: utf-8 -*-

from odoo import fields, models, api, _
from odoo.exceptions import ValidationError


class CashReceiptWizard(models.TransientModel):
    _name = 'origin_application_resources.cash_receipt_wizard'
    _description = 'Generate an accounting entry to other origin cash receipts'

    oar_type = fields.Selection([('origin', 'Origin'), ('application', 'Application')])
    journal_id = fields.Many2one('account.journal', string='Journal')
    name = fields.Selection([('transfer_received', 'Transfer Received'),
                             ('other_payments', 'Other Payments')], string="Operation Type")
    amount = fields.Float(string="Amount")
    
    @api.multi
    def generate_account_entry(self):
        lines = []
        value = self.amount
        debit = {
            "account_id": self.get_debit_account(),
            "credit": -value if value < 0 else 0,
            "debit": value if value > 0 else 0,
        }
        lines.append((0, 0, debit))
        credit = {
            "account_id": self.get_credit_account(),
            "debit": -value if value < 0 else 0,
            "credit": value if value > 0 else 0,
        }
        lines.append((0, 0, credit))
        values = {
            "ref": _("Received Transfer"),
            "journal_id": self.journal_id.id,
            "oar_type": self.oar_type,
            "line_ids": lines,
            "is_settled": False,
        }
        move = self.env['account.move'].create(values)
        move.post()
        return True

    @api.multi
    @api.constrains('amount')
    def validate_values(self):
        if self.amount <= 0:
            raise ValidationError(_("Cannot make a transaction with an amount less than or equal to zero"))

    @api.multi
    def get_debit_account(self):
        if self.name == 'transfer_received':
            return self.journal_id.default_debit_account_id.id
        if self.name == 'other_payments':
            raise ValidationError(_("Sorry, this functionality is don't implemented"))

    @api.multi
    def get_credit_account(self):
        if self.name == 'transfer_received':
            transfer_id = self.env.user.company_id.transfer_account_id
            if not transfer_id:
                raise ValidationError(_("The transfer account for this company cannot be found."))
            return transfer_id.id
        if self.name == 'other_payments':
            raise ValidationError(_("Sorry, this functionality is don't implemented"))
