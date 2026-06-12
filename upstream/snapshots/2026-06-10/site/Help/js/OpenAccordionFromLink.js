jQuery(document).ready(function () {
	// get the #section from the URL
	var hash = window.location.hash;
    //jQuery(hash).click();

    // Adapted from https://stackoverflow.com/questions/38505700/open-an-accordion-panel-from-an-external-link
	
    // open accordion
	jQuery(hash).slideDown(300).addClass('open');
	// set title to active
    jQuery(hash).prev('.accordion-section-title').addClass('active');

	function close_accordion_section() {
		jQuery('.accordion .accordion-section-title').removeClass('active');
		jQuery('.accordion .accordion-section content').slideUp(300).removeClass('open');
	}

	jQuery('.accordion-section-title').click(function (e) {
		e.preventDefault();

		// Grab current anchor value
		var currentAttrValue = jQuery(this).attr('id');

        // TODO This adds the section title id to the URL, but the section title id is needed to open the accordion. Also, page needs to be refreshed (like link from same page)
        //window.location.hash = currentAttrValue;

		if (jQuery(e.target).is('.active')) {
			close_accordion_section();
		} else {
			close_accordion_section();

			// Add active class to section title
			jQuery(this).addClass('active');
			// Open up the hidden content panel
			jQuery('.accordion ' + currentAttrValue).slideDown(300).addClass('open');
		}
	});
    
});