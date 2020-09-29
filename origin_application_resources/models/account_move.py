# -*- coding: utf-8 -*-

from odoo import fields, models, api, _
from odoo.exceptions import ValidationError


class AccountMove(models.Model):
    _inherit = "account.move"

    is_settled = fields.Boolean(string="Is Settled", default=False)
    oar_type = fields.Selection([('origin', "Origin"), ('application', "Application"), ('liquidation', 'Liquidation')])

    @api.multi
    def post(self, invoice=False):
        res = super(AccountMove, self).post(invoice)
        if self.oar_type == 'liquidation':
            settings = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
                "origin_application_resources.general_settings_data")
            liquidation_journal = settings.liquidation_journal_id
            if liquidation_journal and self.journal_id.id == liquidation_journal.id:
                self.validate_liquidation(settings)
        return res

    @api.multi
    def validate_liquidation(self, settings):
        if not settings.application_journal_ids or not settings.origin_journal_ids:
            raise ValidationError(_("Please, set the journals in configuration"))
        account_ids = settings.liquidation_journal_id.mapped("default_credit_account_id.id")
        liquidation = self.with_context({'force_company': self.env.user.company_id.id, 'to_settle': True}).env.ref(
            "origin_application_resources.liquidation_flow_data")
        lines = self.line_ids.filtered(lambda s: s.account_id.id in account_ids)
        sum = 0
        for line in lines:
            sum += line.debit - line.credit
        if sum != liquidation.diff:
            raise ValidationError(_("The value to settle must be equal to the sum of the accounting entries."))
        else:
            self.write({'is_settled': True})


    @api.multi
    def get_move_ids(self, journals):
        sql = """SELECT
                am.id AS id
                FROM account_move AS am
                WHERE am.journal_id IN (%s)
                AND am.company_id = %s
                AND am.state = 'posted'
            """ % (str(journals)[1:-1], str(self.env.user.company_id.id))
        self.env.cr.execute(sql)
        values = self.env.cr.dictfetchall()
        ids = [i['id'] for i in values]
        return ids

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
    mark_to_settle = fields.Boolean(string="Mark to Settle", default=True)
    


