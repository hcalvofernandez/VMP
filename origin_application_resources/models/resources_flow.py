# -*- coding: utf-8 -*-

from odoo import models, fields, api, _


class ResourcesFlow(models.Model):
    _name = "origin_application_resources.resources_flow"
    _description = "manage the origin and application of resources"

    color = fields.Integer(string="Color Index")
    type = fields.Selection([('origin', "Resources Origin"),
                             ('application', "Resources Application"),
                             ('liquidation', "Balance")], string="Type")
    total_settled = fields.Float(string="Total Settled", compute="_compute_total")
    total = fields.Float(compute="_compute_total", string="Total")
    diff = fields.Float(compute="_compute_total", string="Difference")
    percent_in_origin = fields.Float(compute="_compute_total", string="percent")
    in_guard = fields.Float(compute="_compute_total", string="In Guard")
    total_guard = fields.Float(compute="_compute_total", string="Total Guard")

    @api.model
    def _compute_total(self):
        origin = self.get_origin_total()
        application = self.get_applications_total()
        liquidation = self.get_liquidation_total()
        domain = [('company_id', '=', self.env.user.company_id.id)]
        last = self.env['origin_application_resources.liquidation_log'].search(domain, limit=1, order='id desc')
        last_guard = last.in_guard if last else 0.0
        for rec in self:
            rec.in_guard = last_guard
            if rec.type == "origin":
                rec.total_settled = origin[0]['total'] - origin[0]['total_pending']
                rec.total = origin[0]['total']
                rec.diff = origin[0]['total_pending']
                if origin[0]['total_pending'] + rec.in_guard > 0:
                    rec.percent_in_origin = (rec.diff + rec.in_guard)/(origin[0]['total_pending'] + rec.in_guard) * 100
            elif rec.type == "application":
                rec.total_settled = application[0]['total'] - application[0]['total_pending']
                rec.total = application[0]['total']
                rec.diff = application[0]['total_pending']
                if origin[0]['total_pending'] + last_guard > 0:
                    rec.percent_in_origin = rec.diff / (last_guard + origin[0]['total_pending']) * 100
            elif rec.type == "liquidation":
                rec.total_settled = application[0]['total'] - application[0]['total_pending']
                rec.total_settled = liquidation[0]['total']
                rec.total = liquidation[0]["total"]
                rec.diff = rec.in_guard + origin[0]["total_pending"] - application[0]['total_pending']
                if origin[0]['total_pending'] + last_guard > 0:
                    rec.percent_in_origin = rec.diff / (last_guard + origin[0]['total_pending']) * 100
            rec.total_guard = rec.diff + rec.in_guard

    @api.model
    def get_origin_total(self):
        origin_journals = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").origin_journal_ids
        if not origin_journals:
            return [{"total": 0, "total_pending": 0}]
        account_ids = origin_journals.mapped("default_debit_account_id.id")
        origin_total_sql = """SELECT
                                SUM(aml.debit - aml.credit) AS total,
                                SUM(CASE WHEN am.is_settled = false THEN aml.debit - aml.credit ELSE 0 END) 
                                AS total_pending
                                FROM account_move_line AS aml
                                INNER JOIN account_move AS am ON am.id = aml.move_id
                                WHERE am.journal_id IN (%s)
                                AND aml.account_id IN (%s)
                                AND am.company_id = %s
                                AND am.is_settled IN (true,false)
                                AND am.oar_type = 'origin'
                                AND am.state = 'posted'
                            """ % (str(origin_journals.ids)[1:-1], str(account_ids)[1:-1],
                                   str(self.env.user.company_id.id))
        if "periods" in self.env.context:
            origin_total_sql += """AND am.liquidation_id IN (%s)
            """ % str(self._context.get("periods"))[1:-1]
        if "to_settle" in self.env.context:
            origin_total_sql += "AND aml.mark_to_settle = true"
        self.env.cr.execute(origin_total_sql)
        result = self.env.cr.dictfetchall()
        if not result[0]['total']:
            result[0]['total'] = 0
        if not result[0]['total_pending']:
            result[0]['total_pending'] = 0
        return result

    @api.model
    def get_applications_total(self):
        application_journals = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").application_journal_ids
        if not application_journals:
            return [{"total": 0, "total_pending": 0}]
        account_ids = application_journals.mapped("default_credit_account_id.id")
        application_total_sql = """SELECT
                                    SUM(aml.credit-aml.debit) AS total,
                                    SUM(CASE WHEN am.is_settled = false THEN aml.credit - aml.debit ELSE 0 END)
                                    AS total_pending
                                    FROM account_move_line AS aml
                                    INNER JOIN account_move AS am ON am.id = aml.move_id
                                    WHERE am.journal_id IN (%s)
                                    AND aml.account_id IN (%s)
                                    AND am.company_id = %s
                                    AND am.is_settled IN (true,false)
                                    AND am.oar_type = 'application'
                                    AND am.state = 'posted'
                                """ % (str(application_journals.ids)[1:-1], str(account_ids)[1:-1],
                                        str(self.env.user.company_id.id))
        if "periods" in self.env.context:
            application_total_sql += """AND am.liquidation_id IN (%s)
            """ % str(self._context.get("periods"))[1:-1]
        if "to_settle" in self.env.context:
            application_total_sql += "AND aml.mark_to_settle = true"
        self.env.cr.execute(application_total_sql)
        result = self.env.cr.dictfetchall()
        if not result[0]['total']:
            result[0]['total'] = 0
        if not result[0]['total_pending']:
            result[0]['total_pending'] = 0
        return result

    @api.model
    def get_liquidation_total(self):
        liquidation_journal = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").liquidation_journal_id
        if not liquidation_journal:
            return [{"total": 0, "total_pending": 0}]
        account_ids = [liquidation_journal.default_credit_account_id.id, ]
        liquidation_total_sql = """SELECT
                                    SUM(aml.credit - aml.debit) AS total,
                                    SUM(CASE WHEN am.is_settled = false THEN aml.credit - aml.debit ELSE 0 END) 
                                    AS total_pending
                                    FROM account_move_line AS aml
                                    INNER JOIN account_move AS am ON am.id = aml.move_id
                                    WHERE am.journal_id = %s
                                    AND aml.account_id IN (%s)
                                    AND am.company_id = %s
                                    AND am.is_settled IN (true,false)
                                    AND am.oar_type = 'liquidation'
                                    AND am.state = 'posted'
                                """ % (str(liquidation_journal.id), str(account_ids)[1:-1],
                                       str(self.env.user.company_id.id))
        if "periods" in self.env.context:
            liquidation_total_sql += """AND am.id IN (%s)
            """ % str(self._context.get("periods"))[1:-1]
        if "to_settle" in self.env.context:
            liquidation_total_sql += "AND aml.mark_to_settle = true"
        self.env.cr.execute(liquidation_total_sql)
        result = self.env.cr.dictfetchall()
        if not result[0]['total']:
            result[0]['total'] = 0
        if not result[0]['total_pending']:
            result[0]['total_pending'] = 0
        return result
