# -*- coding: utf-8 -*-

from odoo import fields, models, api, _
from odoo.exceptions import ValidationError


class LiquidationWizard(models.TransientModel):
    _name = 'origin_application_resources.liquidation_wizard'

    @api.model
    def _get_default_origins_to_settle(self):
        origin_journals = self.env.ref("origin_application_resources.general_settings_data").origin_journal_ids
        if not origin_journals:
            raise Warning("Please, set the journals in the configuration")
        account_ids = origin_journals.mapped('default_debit_account_id.id')
        domain = [('journal_id', 'in', origin_journals.ids), ('oar_type', '=', 'origin'),
                  ('account_id', 'in', account_ids), ('move_state', '=', 'posted'), ('is_settled', '=', False)]
        _ids = self.env['account.move.line'].search(domain).ids
        return [(6, 0, _ids)]

    @api.model
    def _get_default_applications_to_settle(self):
        application_journals = self.env.ref(
            "origin_application_resources.general_settings_data").application_journal_ids
        if not application_journals:
            raise Warning("Please, set the journals in the configuration")
        account_ids = application_journals.mapped('default_credit_account_id.id')
        domain = [('journal_id', 'in', application_journals.ids), ('oar_type', '=', 'application'),
                  ('account_id', 'in', account_ids), ('move_state', '=', 'posted'), ('is_settled', '=', False)]
        _ids = self.env['account.move.line'].search(domain).ids
        return [(6, 0, _ids)]

    origin_to_settle = fields.Many2many("account.move.line", "origin_account_move_liquidation_wizard",
                                        default=_get_default_origins_to_settle)
    application_to_settle = fields.Many2many("account.move.line", "application_account_move_liquidation_wizard",
                                             default=_get_default_applications_to_settle)

    origin_amount = fields.Float(string="Origin Amount", compute="compute_origin")
    application_amount = fields.Float(string="Application Amount", compute="compute_application")
    to_settle = fields.Float(string="To Settle", compute="compute_to_settle")

    @api.depends("origin_to_settle")
    def compute_origin(self):
        for rec in self:
            to_settle = rec.origin_to_settle.filtered(lambda s: s.mark_to_settle is True)
            result = sum(to_settle.mapped('balance'))
            rec.origin_amount = result

    @api.depends("application_to_settle")
    def compute_application(self):
        for rec in self:
            to_settle = rec.application_to_settle.filtered(lambda s: s.mark_to_settle is True)
            result = sum(to_settle.mapped('balance'))
            rec.application_amount = result

    @api.depends('origin_amount', 'application_amount')
    def compute_to_settle(self):
        for rec in self:
            rec.to_settle = rec.origin_amount + rec.application_amount

    @api.multi
    def create_liquidation_move(self):
        if self.to_settle < 0:
            raise ValidationError(_("You can not to settle a negative value"))
        settings = self.env.ref("origin_application_resources.general_settings_data")
        if not settings.liquidation_journal_id:
            raise ValidationError(_("Please, configure a liquidation journal."))
        domain = [('oar_type', '=', 'liquidation'), ('is_settled', '=', False), ('state', 'not in', ['posted'])]
        move = self.env['account.move'].search(domain)
        if not move:
            move = self.get_account_move_to_settle(settings)
        move.post()
        move_ids = self.origin_to_settle.filtered(lambda s: s.mark_to_settle is True).mapped('move_id')
        move_ids += self.application_to_settle.filtered(lambda s: s.mark_to_settle is True).mapped('move_id')
        move_ids.write({'is_settled': True})
        self.origin_to_settle.filtered(lambda s: s.mark_to_settle is False).write({'mark_to_settle': True})
        self.application_to_settle.filtered(lambda s: s.mark_to_settle is False).write({'mark_to_settle': True})
        return {
            "name": _("Liquidation of Origin and Application"),
            "type": 'ir.actions.act_window',
            "res_model": "account.move",
            "view_mode": "form",
            "res_id": move.id,
        }

    @api.multi
    def get_account_move_to_settle(self, settings):
        return self.env['account.move'].create(self.get_data_move(settings))

    @api.multi
    def get_data_move(self, settings):
        origin_journals = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").origin_journal_ids
        liquidation_journal = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").liquidation_journal_id
        value = self.to_settle
        data = {
            "account_id": liquidation_journal.default_credit_account_id.id if liquidation_journal else False,
            "credit": -value if value < 0 else 0,
            "debit": value if value > 0 else 0,
        }
        data2 = {
            "account_id": origin_journals[0].default_debit_account_id.id if origin_journals else False,
            "debit": -value if value < 0 else 0,
            "credit": value if value > 0 else 0,
        }
        lines = [(0, 0, data), (0, 0, data2), ]

        return {
            "ref": _("Liquidation of Origin and Application"),
            "journal_id": settings.liquidation_journal_id.id,
            "oar_type": "liquidation",
            "line_ids": lines,
        }
