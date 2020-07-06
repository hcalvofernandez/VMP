# -*- coding:utf-8 -*-

from odoo import models, api


class ReportCreditSummary(models.AbstractModel):
    _name = 'report.credit.report_credit_summary'

    @api.model
    def _get_report_values(self, docids, data=None):
        data['company_currency'] = self.env.user.company_id.currency_id
        return {
            'data': data,
        }

class ReportCreditSummaryIndividual(models.AbstractModel):
    _name = 'report.credit.report_credit_summary_individual'

    @api.model
    def _get_report_values(self, docids, data=None):
        partner_id = self._context.get('partner_id')
        partner = self.env['res.partner'].browse(partner_id)
        return {
            'data': data,
            "company_currency": self.env.user.company_id.currency_id,
            "partner": partner,
        }
