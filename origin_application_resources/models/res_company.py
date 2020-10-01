# -*- coding: utf-8 -*-

from odoo import fields, models, api
from odoo.exceptions import ValidationError


class ResCompany(models.Model):
    _inherit = 'res.company'

    cash_journal_id = fields.Many2one("account.journal", string="Cash Receipt Journal")

    @api.constrains('cash_journal_id')
    def _check_company_cash_journal(self):
        if self.cash_journal_id and self.cash_journal_id.company_id.id != self.id:
            raise ValidationError(_('Select a current company journal'))
    


