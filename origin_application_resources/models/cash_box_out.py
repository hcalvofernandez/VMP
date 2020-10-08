from odoo import api, _
from addons.point_of_sale.wizard import pos_box
from odoo.exceptions import ValidationError


class CashBoxOut(pos_box.CashBox):
    _inherit = 'cash.box.out'

    @api.one
    def create_reconciliation_move(self, record):
        if not record:
            return
        session = record.pos_session_id
        if not session:
            return
        lines = []
        value = self.amount
        journal = record.journal_id
        if not journal:
            raise ValidationError(_('The journal for this payment is not found'))
        transfer_id = self.env.user.company_id.transfer_account_id
        if not transfer_id:
            raise ValidationError(_('The transfer account for this company is not found'))
        debit = {
            "account_id": journal.default_debit_account_id.id,
            "credit": -value if value < 0 else 0,
            "debit": value if value > 0 else 0,
        }
        lines.append((0, 0, debit))
        credit = {
            "account_id": transfer_id.id,
            "debit": -value if value < 0 else 0,
            "credit": value if value > 0 else 0,
        }
        lines.append((0, 0, credit))
        values = {
            "ref": "%s - %s" % (session.config_id.name, session.name),
            "journal_id": journal.id,
            "oar_type": 'origin',
            "line_ids": lines,
            "is_settled": False,
        }
        move = self.env['account.move'].create(values)
        move.post()

    @api.one
    def _create_bank_statement_line(self, record):
        res = super(CashBoxOut, self)._create_bank_statement_line(record)
        if res:
            self.create_reconciliation_move(record)
        return res
