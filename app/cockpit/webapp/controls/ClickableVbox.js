sap.ui.define(["sap/m/VBox"],
	function(VBox) {
	"use strict";
	
	var oClickableVbox = VBox.extend("com.buyerui.buyerui.controls.ClickableVbox", { 
		metadata : {
			properties: {
				key: {type: "string", defaultValue : null}
			},
			events: {
				press : {
					parameters : {
						key: {type : "string", defaultValue : "test"}
					}
				}
        	}
		},
		
		renderer: "sap.m.VBoxRenderer"
	});
	
	oClickableVbox.prototype.onclick = function(oEvent){
		this.firePress();
	};

	return oClickableVbox;

});
