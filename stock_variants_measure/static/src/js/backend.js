odoo.define("qty_product_pack_discount.packPrice_Backend", function (require) 
{
    var rpc = require('web.rpc'); 
    $(document).ready(function(){
        var interval = setInterval(function () 
        {
            if($(".product_template_id").length>0)
            {
                var product_id = $(".product_template_id").text();
                if(product_id>0)
                {
                     var current_label = $('.product_template_bigger_price').closest("tr").find("td").first().find("label").text()
                if(current_label=="Bigger Price")
                {
                    var pack_price_label = rpc.query({
                    model: 'product.template',    
                    method: 'get_product_uom_bigger_label',  
                    args: [product_id]
                 });
                 pack_price_label.then(function(label){
                    label = String("Precio por ") + String (label)
                    $('.product_template_bigger_price').closest("tr").find("td").first().find("label").text(label);
                    //clearInterval(interval)
                 });
                }
                }
               
                
            }
            
        },10);
    });
    
});