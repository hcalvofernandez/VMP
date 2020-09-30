# -*- coding: utf-8 -*-

from odoo import models, api


class PosOrder (models.Model):
    _inherit = 'pos.order'

    def _prepare_bank_statement_line_payment_values(self, data):
        res = super(PosOrder, self)._prepare_bank_statement_line_payment_values(data)
        if 'journal_id' in res:
            origin_journals = self.env.ref("origin_application_resources.general_settings_data").origin_journal_ids.ids
            if origin_journals and res['journal_id'] in origin_journals:
                res['oar_type'] = 'origin'
        return res
