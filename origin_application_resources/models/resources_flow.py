# -*- coding: utf-8 -*-

from odoo import models, fields, api, _


class Account_Move(models.Model):
    _inherit = "account.move"

    is_settled = fields.Boolean(string="Is Settled", default=False)


class ResourcesFlow(models.Model):
    _name = "origin_application_resources.resources_flow"
    _description = "manage the origin and application of resources"

    color = fields.Integer(string="Color Index")
    type = fields.Selection([('origin', "Resources Origin"),
                             ('application', "Resources Application"),
                             ('liquidation', "Liquidation")], string="Type")
    total_settled = fields.Float(string="Total Settled")
    total = fields.Float(compute="_compute_total", string="Total")
    diff = fields.Float(compute="_compute_total", string="Difference")


    @api.model
    def _compute_total(self):
        for rec in self:
            if rec.type == "origin":
                origin_journals = self.env.ref("origin_application_resources.general_settings_data").origin_journal_ids.ids
                if not origin_journals:
                    return
                origin_total_sql = """SELECT
                    SUM(aml.debit) AS total
                    FROM account_move_line AS aml
                    INNER JOIN account_move AS am ON am.id = aml.move_id
                    WHERE am.journal_id IN (%s)
                    AND am.company_id = %s
                    AND am.is_settled = false
                """ % (str(origin_journals)[1:-1], str(rec.env.user.company_id.id))

                self.env.cr.execute(origin_total_sql)
                rec.total = self.env.cr.dictfetchall()[0]['total']
                rec.diff = rec.total - rec.total_settled
            elif rec.type == "application":
                application_journals = self.env.ref("origin_application_resources.general_settings_data").application_journal_ids.ids
                if not application_journals:
                    return
                application_total_sql = """SELECT
                    SUM(aml.credit) AS total
                    FROM account_move_line AS aml
                    INNER JOIN account_move AS am ON am.id = aml.move_id
                    WHERE am.journal_id IN (%s)
                    AND am.company_id = %s
                    AND am.is_settled = false
                """ % (str(application_journals)[1:-1], str(rec.env.user.company_id.id))
                self.env.cr.execute(application_total_sql)
                rec.total = self.env.cr.dictfetchall()[0]['total']
                rec.diff = rec.total - rec.total_settled
            elif rec.type == "liquidation":
                liquidation_journal = self.env.ref("origin_application_resources.general_settings_data").liquidation_journal_id.id
                if not liquidation_journal:
                    return
                liquidation_total_sql = """SELECT
                                    SUM(aml.credit) AS total
                                    FROM account_move_line AS aml
                                    INNER JOIN account_move AS am ON am.id = aml.move_id
                                    WHERE am.journal_id IN (%s)
                                    AND am.company_id = %s
                                    AND am.is_settled = false
                                """ % (str(liquidation_journal), str(rec.env.user.company_id.id))
                self.env.cr.execute(liquidation_total_sql)
                rec.total = self.env.cr.dictfetchall()[0]['total']
                rec.diff = rec.total - rec.total_settled

    @api.multi
    def settle_pending(self):
        settings = self.env.ref("origin_application_resources.general_settings_data")
        journals = settings.origin_journal_ids.ids+settings.application_journal_ids.ids+[settings.liquidation_journal_id.id]
        # origin_pending = self.env.ref("origin_application_resources.origin_resource_flow_data")
        # application_pending = self.env.ref("origin_application_resources.application_resource_flow_data")
        # liquidation_pending = self.env.ref("origin_application_resources.liquidation_flow_data")

        account_move = self.env['account.move'].search([('is_settled', '=', False), ('journal_id', 'in', journals)])
        account_move.write({
            'is_settled': True,
        })
