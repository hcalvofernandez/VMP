# -*- coding: utf-8 -*-

from odoo import fields, models, api, _
from odoo.exceptions import ValidationError


class AccountMove(models.Model):
    _inherit = "account.move"

    is_settled = fields.Boolean(string="Is Settled", default=False)
    oar_type = fields.Selection([('origin', "Origin"), ('application', "Application"), ('liquidation', 'Liquidation')])

    @api.multi
    def mark_as_origin(self):
        if self.is_settled:
            raise ValidationError(_('This operation is settled'))
        origin_journals = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").origin_journal_ids
        if self.journal_id not in origin_journals:
            raise ValidationError(_("The journal %s is not a origin journal") % self.journal_id.name)
        return self.write({'oar_type': 'origin'})

    @api.multi
    def mark_as_application(self):
        if self.is_settled:
            raise ValidationError(_('This operation is settled'))
        application_journals = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").application_journal_ids
        if self.journal_id not in application_journals:
            raise ValidationError(_("The journal %s is not a application journal") % self.journal_id.name)
        return self.write({'oar_type': 'application'})

    @api.multi
    def remove_mark(self):
        if self.is_settled:
            raise ValidationError(_('This operation is settled'))
        if self.oar_type:
            self.write({'oar_type': False})


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    is_settled = fields.Boolean(related='move_id.is_settled')
    move_state = fields.Selection(related='move_id.state')
    oar_type = fields.Selection(related="move_id.oar_type")
    liquidation_id = fields.Many2one("origin_application_resources.liquidation_log")
    liquidation_origin_id = fields.Many2one("origin_application_resources.liquidation_log")
    mark_to_settle = fields.Boolean(string="Mark to Settle", default=True)
    guard_value = fields.Boolean(string="Guard Cash", default=False)
