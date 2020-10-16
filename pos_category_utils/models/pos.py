# -*- coding: utf-8 -*-

from odoo import models, fields, api, tools, _
import logging


_logger = logging.getLogger('_______________________________________________________'+__name__)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    pos_category_ids = fields.Many2many('pos.category', string='Categorías TPV')

    @api.onchange('pos_category_ids')
    def _onchange_pos_category_ids(self):
        if len(self.pos_category_ids):
            return {'domain': {'iface_start_categ_id': ['|', '|',('id', 'in', self.pos_category_ids.ids), ('child_id', 'in', self.pos_category_ids.ids), ('id', 'child_of', self.pos_category_ids.ids)]}}


class PosCategory(models.Model):
    _inherit = "pos.category"

    pos_config_ids = fields.Many2many('pos.config', string='Cajas')

    @api.multi
    def read(self, fields=None, load='_classic_read'):
        if self.env.context.get('pos_category_utils_read', False) and 'child_id' in fields:
            real_categories = self.browse(self.ids)
            real_data = super(PosCategory, real_categories).read(fields=fields, load=load)
            for r in real_data:
                to_remove = []
                for categ_id in r['child_id']:
                    if categ_id not in self.ids:
                        to_remove.append(categ_id)

                for categ_id in to_remove:
                    r['child_id'].remove(categ_id)

            return real_data
        else:
            return super(PosCategory, self).read(fields, load)


    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        if self.env.context.get('pos_category_utils_search', False):
            pos_session = self.env['pos.session'].search([('user_id', '=', self.env.context.get('uid')), ('state', '=', 'opened')])
            if pos_session and len(pos_session.config_id.pos_category_ids):
                args += ['|', '|', ('id', 'in', pos_session.config_id.pos_category_ids.ids), ('child_id', 'in', pos_session.config_id.pos_category_ids.ids), ('id', 'child_of', pos_session.config_id.pos_category_ids.ids)]
                context = dict(self.env.context)
                del context['pos_category_utils_search']
                context['pos_category_utils_read'] = True
                res = super(PosCategory, self.with_context(context)).search(args=args, offset=offset, limit=limit, order=order, count=count)
            else:
                res = super(PosCategory, self).search(args=args, offset=offset, limit=limit, order=order,
                                                          count=count)
        else:
            res = super(PosCategory, self).search(args=args, offset=offset, limit=limit, order=order, count=count)

        return res
