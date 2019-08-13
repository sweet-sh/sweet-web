#include <stdio.h>
#include <emscripten/emscripten.h>
#define STBI_ONLY_JPEG
#define STBI_ONLY_PNG
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"


EM_JS(void, talkAboutProgress, (double progress), {
  postMessage(""+progress);
});

static void my_progress_report(float progress);
#define STBIR_PROGRESS_REPORT(val) my_progress_report(val)

#define STB_IMAGE_RESIZE_IMPLEMENTATION
#include "stb_image_resize.h"

static void my_progress_report(float progress){
   talkAboutProgress(progress*100);
}


//flattens a 4 channel image against a simulated white background, setting the alpha channel to opaque for all pixels
void flattenerOuter(unsigned char *image, int w, int h){
	for(int reader=0,writer=0; reader < w*h*4; reader++){
		int channel = reader%4;
		if(channel!=3){
			unsigned char alpha = image[reader+(3-channel)];
			image[writer] = (unsigned char)(image[reader] * alpha / 255.0 + (255-alpha));
			writer++;
		}
	}
	image = realloc(image, w*h*3*sizeof(unsigned char));
}

//takes a 3 channel image and crops it into a square, so that both of its dimensions are now equal to its smallest dimension. returns that dimention.
int makeSquarer(unsigned char *image, int w, int h){
	int writer = 0;
	if(w>h){
		for(int y = 0; y < h; y++){
			for(int x = ((w-h)/2)*3; x < ((w-h)/2)*3+(h*3); x++){
				image[writer] = image[x+(y*w*3)];
				writer++;
			}
		}
		image = realloc(image, h*h*sizeof(unsigned char)*3);
		return h;
	}else if(h>w){
		for(int y = (h-w)/2; y < ((h-w)/2)+w; y++){
			for(int x = 0; x < w*3; x++){
				image[writer] = image[x+(y*w*3)];
				writer++;
			}
		}
		image = realloc(image, w*w*sizeof(unsigned char)*3);
		return w;
	}else{
		return w; //arbitrary bc they're both the same
	}
}

void EMSCRIPTEN_KEEPALIVE profileImage(int argc, char ** argv) {
	int x,y,n;
    unsigned char *data = stbi_load("image", &x, &y, &n, 0);
	if(data==NULL){
		printf("error!\n");
	}else{
		printf("success!\n");
		if(n<3 || n>4){
			assert(0);
			return;
		}
		unsigned char * sizedImage;
		if(x>600 && y > 600){
			int newx = x > y ? 600.0/y*x : 600;
			int newy = x > y ? 600: 600.0/x*y;
			sizedImage = (unsigned char *) malloc(newx*newy*n*sizeof(unsigned char));
			if(stbir_resize_uint8(data, x, y, 0, sizedImage, newx, newy, 0, n) == 0){
				assert(0);
				return;
			}
			stbi_image_free(data);
			x = newx;
			y = newy;
		}else{
			sizedImage = data;
		}
		if(n==4){
			flattenerOuter(sizedImage, x, y);
		}
		int side = makeSquarer(sizedImage,x,y);
		stbi_write_jpg("output.jpg", side, side, 3, sizedImage, 90);
		stbi_image_free(sizedImage);
	}
}