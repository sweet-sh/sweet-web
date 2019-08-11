#include <stdio.h>
#include <emscripten/emscripten.h>
#include "wand/MagickWand.h"

int main(int argc, char ** argv) {
    printf("Hello World\n");
}

#ifdef __cplusplus
extern "C" {
#endif

void EMSCRIPTEN_KEEPALIVE getImage(int argc, char ** argv) {
	FILE * fp = fopen("filename", "r");
    printf("Ik heb een bestand\n");
	fclose(fp);
}

#ifdef __cplusplus
}
#endif