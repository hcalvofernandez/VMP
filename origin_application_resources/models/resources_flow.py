# -*- coding: utf-8 -*-

from odoo import models, fields, api, _

from odoo.exceptions import ValidationError


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
    total_settled = fields.Float(compute="_compute_total", string="Total Settled")
    total = fields.Float(compute="_compute_total", string="Total")
    diff = fields.Float(compute="_compute_total", string="Difference")
    percent_in_origin = fields.Float(compute="_compute_total", string="percent")

    @api.model
    def _compute_total(self):
        for rec in self:
            if rec.type == "origin":
                result = rec.get_origin_total()
                if not result[0]['total'] or not result[0]['total_pending']:
                    continue
                rec.total_settled = result[0]['total']-result[0]['total_pending']
                rec.total = result[0]['total']
                rec.diff = result[0]['total_pending']
                rec.percent_in_origin = 100.0
            elif rec.type == "application":
                origin = rec.get_origin_total()[0]['total_pending']
                result = rec.get_applications_total()
                if not result[0]['total'] or not result[0]['total_pending']:
                    continue
                rec.total_settled = result[0]['total']-result[0]['total_pending']
                rec.total = result[0]['total']
                rec.diff = result[0]['total_pending']
                if origin > 0:
                    rec.percent_in_origin = rec.diff/origin*100
                else:
                    rec.percent_in_origin = 0
            elif rec.type == "liquidation":
                origin = rec.get_origin_total()
                application = rec.get_applications_total()
                if not origin[0]['total'] or not origin[0]['total_pending']:
                    continue
                if not application[0]['total'] or not application[0]['total_pending']:
                    continue
                rec.total_settled = (origin[0]["total"] - origin[0]["total_pending"]) - (application[0]["total"] - application[0]["total_pending"])
                rec.total = origin[0]["total"] - application[0]["total"]
                rec.diff = origin[0]["total_pending"] - application[0]["total_pending"]
                if origin[0]["total_pending"] > 0:
                    rec.percent_in_origin = rec.diff/origin[0]["total_pending"]*100
                else:
                    rec.percent_in_origin = 0


    @api.model
    def get_origin_total(self):
        origin_journals = self.env.ref(
            "origin_application_resources.general_settings_data").origin_journal_ids.ids
        if not origin_journals:
            raise ValidationError(_("Please, set the journals in the configuration"))
        origin_total_sql = """SELECT
                                SUM(aml.debit) AS total,
                                SUM(CASE WHEN am.is_settled = false THEN aml.debit ELSE 0 END) AS total_pending
                                FROM account_move_line AS aml
                                INNER JOIN account_move AS am ON am.id = aml.move_id
                                WHERE am.journal_id IN (%s)
                                AND am.company_id = %s
                                AND am.is_settled IN (true,false)
                            """ % (str(origin_journals)[1:-1], str(self.env.user.company_id.id))

        self.env.cr.execute(origin_total_sql)
        return self.env.cr.dictfetchall()

    @api.model
    def get_applications_total(self):
        application_journals = self.env.ref(
            "origin_application_resources.general_settings_data").application_journal_ids.ids
        if not application_journals:
            raise ValidationError(_("Please, set the journals in the configuration"))
        application_total_sql = """SELECT
                                SUM(aml.credit) AS total,
                                SUM(CASE WHEN am.is_settled = false THEN aml.credit ELSE 0 END) AS total_pending
                                FROM account_move_line AS aml
                                INNER JOIN account_move AS am ON am.id = aml.move_id
                                WHERE am.journal_id IN (%s)
                                AND am.company_id = %s
                                AND am.is_settled IN (true, false)
                            """ % (str(application_journals)[1:-1], str(self.env.user.company_id.id))
        self.env.cr.execute(application_total_sql)
        return self.env.cr.dictfetchall()

    @api.multi
    def settle_pending(self):
        settings = self.env.ref("origin_application_resources.general_settings_data")
        journals = settings.origin_journal_ids.ids + settings.application_journal_ids.ids + [
            settings.liquidation_journal_id.id]
        # origin_pending = self.env.ref("origin_application_resources.origin_resource_flow_data")
        # application_pending = self.env.ref("origin_application_resources.application_resource_flow_data")
        # liquidation_pending = self.env.ref("origin_application_resources.liquidation_flow_data")

        account_move = self.env['account.move'].search([('is_settled', '=', False), ('journal_id', 'in', journals)])
        account_move.write({
            'is_settled': True,
        })
