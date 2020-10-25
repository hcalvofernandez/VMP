# -*- coding: utf-8 -*-

from odoo import models, api, _


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.multi
    def validate_and_close(self):
        self._withdraw_remaining_cash()
        return super(PosSession, self).validate_and_close()

    @api.multi
    def action_pos_session_validate(self):
        self._withdraw_remaining_cash()
        super(PosSession, self).action_pos_session_validate()

    @api.multi
    def _withdraw_remaining_cash(self):
        for session in self:
            amount = session.cash_register_balance_end_real
            if not amount > 0:
                continue
            deafult_values = {
                'name': _('Manager Withdraw Remaining Cash'),
                'amount': amount,
            }
            context = dict(self._context, active_model='pos.session', active_id=session.id, active_ids=[session.id])
            wizard = self.with_context(context).env['cash.box.out'].create(deafult_values)
            wizard.run()
            session.cash_register_id.write({'balance_end_real': 0})
