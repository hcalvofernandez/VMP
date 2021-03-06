# -*- coding: utf-8 -*-

from odoo import fields, models, api, _
from odoo.exceptions import ValidationError


class LiquidationWizard(models.TransientModel):
    _name = "origin_application_resources.liquidation_wizard"
    _description = "Origin and Application Liquidation Wizard"

    company_currency = fields.Many2one("res.currency", default=lambda s: s.env.user.company_id.currency_id)
    previous_guard = fields.Float(string="Previous Guard", compute="compute_previous_guard")
    origin_amount = fields.Float(string="Origin Amount", compute="compute_origin")
    application_amount = fields.Float(string="Application Amount", compute="compute_application")
    to_settle = fields.Float(string="To Settle", compute="compute_to_settle")
    to_deposit = fields.Float(string="To Deposit")
    in_guard = fields.Float(string="In Guard", compute="compute_to_settle")

    @api.model
    def default_get(self, fields_list):
        result = super(LiquidationWizard, self).default_get(fields_list)
        res = self.env['origin_application_resources.liquidation_log'].search(
            [('company_id', '=', self.env.user.company_id.id)], limit=1, order='id desc')
        if res:
            result['last_guard'] = res.id
            result['previous_guard'] = res.in_guard
        return result

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

    last_guard = fields.Many2one("origin_application_resources.liquidation_log")
    origin_to_settle = fields.Many2many("account.move.line", "origin_account_move_liquidation_wizard",
                                        default=_get_default_origins_to_settle)
    application_to_settle = fields.Many2many("account.move.line", "application_account_move_liquidation_wizard",
                                             default=_get_default_applications_to_settle)

    @api.depends("last_guard")
    def compute_previous_guard(self):
        for rec in self:
            rec.previous_guard = rec.last_guard.in_guard if rec.last_guard else 0.0

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

    @api.depends('last_guard', 'origin_amount', 'application_amount', 'to_deposit')
    def compute_to_settle(self):
        for rec in self:
            rec.to_settle = rec.previous_guard + rec.origin_amount + rec.application_amount
            rec.in_guard = rec.previous_guard + rec.origin_amount + rec.application_amount - rec.to_deposit

    @api.multi
    def create_liquidation_move(self):
        if self.to_settle < 0:
            raise ValidationError(_("You can not to settle a negative value"))
        if self.to_deposit <= 0:
            raise ValidationError(_("You can not deposit a negative or zero amount"))
        if self.in_guard < 0:
            raise ValidationError(_("A negative amount is not allowed in guard"))
        settings = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data")
        if not settings.liquidation_journal_id:
            raise ValidationError(_("Please, configure a liquidation journal."))
        move = self.get_account_move_to_settle(settings)
        move.post()
        self.create_conciliation_move()
        self.create_liquidation_log(move.id)
        move_ids = self.origin_to_settle.filtered(lambda s: s.mark_to_settle is True).mapped('move_id')
        move_ids += self.application_to_settle.filtered(lambda s: s.mark_to_settle is True).mapped('move_id')
        move_ids.write({'is_settled': True, 'liquidation_id': move.id})
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
        return self.env['account.move'].create(self.prepare_data_move(settings))

    @api.multi
    def prepare_data_move(self, settings):
        company_id = self.env.user.company_id
        transfer_id = company_id.transfer_account_id
        if not transfer_id:
            raise ValidationError(_("The transfer account for this company cannot be found."))
        liquidation_journal = settings.liquidation_journal_id
        if not liquidation_journal:
            raise ValidationError(_("Please, configure the liquidation journal."))
        lines = []
        value = self.to_deposit
        transfer_in = {
            "account_id": transfer_id.id,
            "credit": -value if value < 0 else 0,
            "debit": value if value > 0 else 0,
        }
        lines.append((0, 0, transfer_in))
        cash_out = {
            "account_id": liquidation_journal.default_credit_account_id.id if liquidation_journal else False,
            "debit": -value if value < 0 else 0,
            "credit": value if value > 0 else 0,
        }
        lines.append((0, 0, cash_out))
        return {
            "ref": _("Liquidation of Origin and Application"),
            "journal_id": settings.liquidation_journal_id.id,
            "oar_type": "liquidation",
            "line_ids": lines,
            "is_settled": True,
        }

    @api.multi
    def create_conciliation_move(self):
        company_id = self.env.user.company_id.parent_id
        if not company_id:
            raise ValidationError(_("This company is not a secondary company"))
        transfer_id = company_id.transfer_account_id
        if not transfer_id:
            raise ValidationError(_("The transfer account for the company %s cannot be found.") % company_id.name)
        liquidation_journal = company_id.cash_journal_id
        if not liquidation_journal:
            raise ValidationError(_("Please, configure the liquidation journal."))
        lines = []
        value = self.to_deposit
        bank_in = {
            "account_id": liquidation_journal.default_debit_account_id.id,
            "credit": -value if value < 0 else 0,
            "debit": value if value > 0 else 0,
        }
        lines.append((0, 0, bank_in))
        transfer_in = {
            "account_id": transfer_id.id,
            "debit": -value if value < 0 else 0,
            "credit": value if value > 0 else 0,
        }
        lines.append((0, 0, transfer_in))
        values = {
            "ref": _("Cash Deposit: %s" % self.env.user.company_id.name),
            "journal_id": liquidation_journal.id,
            "oar_type": "liquidation",
            "line_ids": lines,
            "is_settled": True,
        }
        move = self.sudo().env['account.move'].create(values)
        move.post()
        return True

    @api.multi
    def create_liquidation_log(self, move_id):
        data = {
            'company_id': self.env.user.company_id.id,
            'previous_guard': self.previous_guard,
            'origin_amount': self.origin_amount,
            'application_amount': self.application_amount,
            'to_settle': self.to_settle,
            'to_deposit': self.to_deposit,
            'in_guard': self.in_guard,
            'last_guard': self.last_guard.id,
            'liquidation_move': move_id,
        }
        if self.origin_to_settle:
            data.update({
                'origin_to_settle':
                    [(6, 0, self.origin_to_settle.filtered(lambda s:s.mark_to_settle is True).ids)]})
        if self.application_to_settle:
            data.update({
                'application_to_settle':
                    [(6, 0, self.application_to_settle.filtered(lambda s:s.mark_to_settle is True).ids)]})
        return self.env['origin_application_resources.liquidation_log'].create(data)
