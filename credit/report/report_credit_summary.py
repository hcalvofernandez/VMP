# -*- coding:utf-8 -*-

from odoo import models, fields, api

class ReportCreditSummary(models.AbstractModel):
    _name = 'report.credit.report_credit_summary'

    @api.model
    def _get_report_values(self, docids, data=None):
        company_id = self._context.get('company_id')
        print(company_id)
        company = self.env['res.company'].browse(company_id)
        data['company_currency'] = company.currency_id
        return {
            'data': data,
            "company_currency": company.currency_id
        }