# -*- coding: utf-8 -*-

import logging
from odoo import api, fields, models, tools, _, SUPERUSER_ID

_logger = logging.getLogger(__name__)


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    @api.model
    @api.returns('self')
    def get_user_roots(self):
        if self.env.user.has_group('base.group_system'):
            return super(IrUiMenu, self).get_user_roots()
        else:
            ids = []
            for record in self.env.user.show_menu_ids:
                if record.show:
                    ids.append(record.menu_id.id)
                
            return self.search([('parent_id', '=', False), ('id', 'in', ids)])