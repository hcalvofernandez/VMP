# -*- coding: utf-8 -*-

from odoo import models, api, _

from odoo.exceptions import ValidationError


class ReportDocument(models.AbstractModel):
    _name = "report.origin_application_resources.report_document"

    @api.model
    def _get_report_values(self, docids, data=None):
        model_data = self._get_data(data["start_date"], data["end_date"])
        data.update(model_data)
        return data

    @api.model
    def _get_data(self, start_date, end_date):
        context = self._context.copy()
        context['start_date'] = start_date
        context['end_date'] = end_date
        flow = self.env["origin_application_resources.resources_flow"].with_context(context).search([])
        flow._compute_total()
        data = {}
        for rec in flow:
            data[rec.type] = {
                "settled": rec.total_settled,
                "value": rec.total,
                "to_settle": rec.diff,
                'percent': rec.percent_in_origin,
            }
            data.update(self.get_details_applications(start_date, end_date))
        return data

    @api.model
    def get_details_applications(self, start_date, end_date):
        application_journals = self.env.ref(
            "origin_application_resources.general_settings_data").application_journal_ids
        account_ids = application_journals.mapped("default_debit_account_id.id")
        account_ids += application_journals.mapped("default_credit_account_id.id")
        if not application_journals:
            raise ValidationError(_("Please, set the journals in the configuration"))
        application_details_sql = """SELECT
                                    aaa.name AS name,
                                    SUM(aml.debit - aml.credit) AS vals
                                    FROM account_move_line AS aml
                                    INNER JOIN account_move AS am ON am.id = aml.move_id
                                    INNER JOIN account_analytic_account AS aaa ON aaa.id = aml.analytic_account_id
                                    WHERE am.journal_id IN (%s)
                                    AND aml.account_id IN (%s)
                                    AND am.company_id = %s
                                    AND am.is_settled IN (true, false)
                                    AND am.date >= '%s'
                                    AND am.date <= '%s'
                                    GROUP BY aaa.name
                                    """ % (str(application_journals.ids)[1:-1], str(account_ids)[1:-1],
                                           str(self.env.user.company_id.id),
                                           start_date, end_date)
        self.env.cr.execute(application_details_sql)
        vals = self.env.cr.dictfetchall()
        return {"application_details": vals}

