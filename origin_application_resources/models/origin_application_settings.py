# -*- coding: utf-8 -*-

from odoo import models, fields, api, _


class OriginApplicationSettings(models.Model):
    _name = "origin_application_resources.settings"

    name = fields.Char(string='Name')
    origin_journal_ids = fields.Many2many("account.journal", "origin_resources_account_journal", string='Origin Journals')
    application_journal_ids = fields.Many2many("account.journal", "application_resources_account_journal", string='Application Journals')
