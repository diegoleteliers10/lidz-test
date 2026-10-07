# Lidz Test Junior: Software Developer

## Caso de llamadas al "ojo" por no poder leer todas las conversaciones.

>Que buscamos solucionar: Que el comercial no necesite leer cada conversacion si no que le apliquemos un filtrado con IA para que podamos facilitar el trabajo y si se da en el caso hacer una segunda o tercera revision. 

### Requisitos e informacion acerca de LIDZ.ai

-> LIDZ se dedica a venta, no arriendos. Esto da un primer filtro que nos ayuda a segmentar inicialmente a los clientes potenciales.

-> Los requisitos son recibir una conversacion o una lista de conversaciones de donde se le pasan al agente para que luego el pueda segmentar la conversacion, poder analizarla y en base a eso poder mostrar un puntaje, un status y un resumen de la conversacion para hacerle saber al comercial si el lead tiene prioridad, no tanto o si no merece la pena absolutamente. 

### De que se conforma el proyecto y que modelo se uso

1. Se usa Nextjs para el front y back, donde /api contiene la ruta de la peticion para la api de la prueba para poder hacer el llamado y recibir la informacion sobre la conversacion. 
2. Ocupa la API Key mencionada de google con Vercel AI SKD el cual permite ahcer la conexion directa al proveedor de google y generar el prompt system adema de los casos de uso para el agente.
3. Se uso CSS propio y lucide-react para el disenado del front, ademas de tokens de css basados en el diseno de LIDZ.ai
4. Zod para el schema de los datos, las salidas y entrada de ellos y poder esquematizar lo que se le indica al agente y como debe ser su salida. 

-> Se utilizo Gemini 3.1 Flash-Lite, ya que a nivel de pricing es barato pero con mejor rendimiento a nivel de agent e inteligencia. Se busco un modelo que pudiera entender e interpretar bien la parte matematica pero sin tanto uso.

### En que consiste y cual es la logica detras. 

Las decisiones se basaron viendo todos los casos de uso posibles, obviamente algunos puedes faltar y la IA puede divagar, pero... en cierto sentido lo que se hizo primero fue generar prioridad en base a las condiciones de la conversacion. 

- Tenemos reclamos, los cuales dependiendo el estilo de reclamo son mas prioritarios o menos. 
- Tenemos alteracion o hack propmting el cual busca que el AI agent actue de manera maliciosa con la data interna del sistema
- Tenemos el alcance donde tal vez se equivoccaron de numero y esto hace que no sea relevante para el agent
- Tenemos el tipo de atencion, si es que necesita que el humano tome accion o simplemente el agent puede seguir conversando y manejando al lead. 
- O cualquier otra cosa extra lo cual al igual que el alcance hace que el agente tome la conversacion como no relevante. 

Por otra parte se le asigna puntajes en base a 6 pilares:
1. La urgencia del usuario
2. La intencion del usuario
3. El ajuste el cual vendria siendo en base a que prioridad tiene
4. La categoria, si es vivienda, inversion, comercial, reclamo o consulta.
5. El presupuesto del usuario
6. La preparacion financiera del usuario

El puntaje final se categoriza segun limited  definidos, los cuales son de un puntaje entre 0 a 40 es un lead de baja categoria , de 41 a 80 media, y 81 a 100 alta. Pero, hay que tener en claro que el puntaje es un valor para controlar el lead, no una probabilidad de cierre.

#### Para el calculo de la aritmetica se tomo en consideracion una formula que viene de 3 factores:

F = factor de monto × preparación financiera -> aqui entra el factor del monto del tipo de casa junto con la preparacion que  
F = factor de monto × preparación financiera -> aqui entra el factor del monto del tipo de casa junto con la preparacion que para vivienda combina ingreso declarado, crédito preaprobado y pie positivo, mientras que para comercial, se usa un factor por superficie solicitada. 

I = urgencia × intención × ajuste -> Cuan nivel de urgencia tiene, cuanta intencion hay del cliente, y el ajuste que unicamente busca responder a la pregunta de si lo que busca el lead concide con lo que ofrece el proyecto que busca. 

B = 1 con presupuesto total conocido. En otro caso, 0.85. -> Si hay presupuesto conocido

> **Puntaje**
100 × F × I × categoría × B
>  La formula se toma de esta manera por que tanto el F, como I y B son valores decimales entre 0 y 1.


### Como funciona internamente

El usuario ve su panel con las conversaciones. Para estye caso en particular y pr no hacer repetidamente una call a la api con el modelo AI que gasta tokens, hay un boton que al presionarlo se pasa el listado de conversaciones con los chats.

Esto hace un post a la api, lo cual va por batches de a 3 para no sobrecargar ni desajustar el modelo, el modelo devuelve una respuesta donde se extrae informacion en formatos especificos validando contra Zod para comprobar la estructura de estos. Luego verifica que existan citas en el mensaje indicado para poder mostrarlas, donde si es que detecta que el caso es invalido, marca el caso para revisión.

En el output de la respuesa inicialmente se evalúan las excepciones, como visita fallida, manipulación, exclusión o incertidumbre, que son las mas importante y el primer filtro. Si ninguna de estas aplica, se hace uso de la formula. 

Finalmente el código asigna la prioridad, la ruta de atención si es humsno, la recomendación de llamada o contacto y el resumen del porque. El front al recibir este output actualiza la informacion delos componentes y conversaciones.

#### Organización del código
- app/page.tsx: pantalla, búsqueda, filtros y estado.
- app/api/analyze/route.ts: entrada HTTP y procesamiento por batch de tres.
- schema.ts: esquemas de datos y comprobación con Zod.
- gemini.ts: llamada al modelo y validación de su salida.
- evidence.ts: comprobación de citas textuales asociadas a los mensajes de las conversaciones.
- priority.constants.ts: valores de pesos asociados.
- priority.ts: contiene el puntaje, prioridad y la ruta de atención.

Para correrlo hay que realizar los siguientes pasos:

1. Instala las dependencias con Bun:
   bun install
   
2. Crear .env en el root:
   GEMINI_API_KEY=tu_clave
   GEMINI_MODEL=gemini-3.1-flash-lite
   GEMINI_MODEL es opcional. La clave queda en el servidor.
   
3. Iniciar la app:
   bun run dev
   
4. Abrir localhost:3000 y pulsa Analizar 10 conversaciones.

#### Como probar el deploy

La app tambien esta disponible en [LidzTest](https://lidz-test-dletelier.vercel.app/), donde para probarla hay que abrir la URL y pulsar Analizar 10 conversaciones. Si no, de igual manera lo puedes probar via curl con:

curl -i https://lidz-test-dletelier.vercel.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "id": "prueba-001",
    "messages": [
      {
        "speaker": "lead",
        "text": "Quiero comprar un departamento para vivir. Mi presupuesto máximo es 4.500 UF y tengo crédito preaprobado."
      }
    ]
  }'

Si solo quieres comprobar que el deploy existe y responde se puede usar: 

curl -i https://lidz-test-dletelier.vercel.app/api/health


Este endpoint comprueba que el servidor responde, pero no hace una llamada a Gemini. La API Key queda en las variables de entorno del servidor y no se envia al navegador ni aparece en esta respuesta. El analisis de las conversaciones se prueba desde el boton de la app.


### Como se testeo y cuanto costo

Se hizo testing via AI directamente a la API para minimizar los tokens inicialmente con un modelo mas barato el cual era el 2.5, el cual se hizo unicamente para probar si es que la AI funcionaba y estaba activa. Luego se realizo con la lista de 10 conversaciones, donde se registro que este daba:

- Entrada: 152.691 tokens.
- Salida: 8.040 tokens.
- Total: 160.731 tokens.

Siguiendo los valores que tiene el modelo 3.1, donde:

Entrada: 152.691 × USD 0.25 / 1.000.000 = USD 0.03817275
Salida:    8.040 × USD 1.50 / 1.000.000 = USD 0.01206000

Se llego a que el total estimado de este test fue de USD 0.05.

#### Alternativas descartadas y el porque

| Alternativa | Motivo para usar la solución actual |
|---|---|
| Pedirle a Gemini el puntaje final | Los calculos de los puntajes con sus pesos permiten utilizar simple matematica que utilizar el modelo gastando tokens para usar pesos y valores al azar |
| Recibir una respuesta en texto libre | JSON y Zod permiten comprobar campos y estados |
| Buscar todo con palabras clave | La IA interpreta el contexto de la conversacion, en cambio las reglas de texto quedan como comprobaciones muy específicas |
| Procesar las diez conversaciones simultáneamente | Los grupos de tres limitan que se hagan multiples llamadas simultaneamente, lo que limita las llamadas la API de Gemini, y permite reducir el riesgo de alcanzar limit rate |
| Crear un backend separado | Next.js cubre el front y la API directamente. Hubiese tomado mas tiempo realizar un back |

### Lo que costo mas

Algo que me costo inicialmente fue comprender cada parte del flujo de la conversacion, ya que hay muchas variables a pensar. No es simplemente recibnir el mensaje y sacar un output de que tanta necesidad se tiene de ver o no a tal cliente. Esto no es simplemente algo hecho por que si. Eso fuie lo que mas costo ya que no era tan simple y contra el tiempo tambien ver todas las variables es algo complicado. Finalmente la resolucion fue aprte de la solucion jaja por mas cliche que suene, se tomo lidz.ai se busco a que se dedican, con quien. Se vio los casops de uso, si es arriendo, si venta, si vivienda, si comercial, que se puede recibir en el mensaje de convedrsacion,que deberia responder el agente, como hacer mas facil el trabajo, etc etc. Lo mas complicado en todo esto mas que el codigo es la lgocia detras. Hay otro tema el cual es el puntaje y  los pesos. Ya que estos deberian venir respaldados por alguina razon en especifico, fue uno de los dolores de cabeza pero finalmente con IA se tomaron valores arbitrarios entre 0 y 1 , que para el caso vienen bien pero dentro de una logica real deberia haber un respaldo matematico, estadistico y demas asociado a cada pilar y cada peso y valor asociado. 


#### Que se haria distinto con mas tiempo

Inicialmente siempre me gusta tener un backend detras para tener un mejor manejo de la API, mas estructuracion y logica de negocio centralizada, por lo que haria un backend. Tambien hubiese probado mas modelos de AI para saber cual es el mas conveniente segun caso de uso teniendo un mejor tradeoff entre precio e inteligencia/rendimiento. Hubiese probado Jev o DecisionAI para por ejemplo ser rapido en cosas como quien debe seguir la conversacion si el humano o agente, que tipo de vivienda, si es lead o no de manera mas rapida y a bajo costo. En vez de usar un boton para analizar que sea via entrar directo a la app, pero mas que por tiempo es por uso de AI. Y finalmente me hubiese gustado tener un mejor entendimiento del negocio, leads, y hacer un flujo de la logica mas detallado y con mejor aproach tal vez ya que con mas tiempo se podrian haber llevado a cosas diferentes, ya sea en frameworks de uso, si decidir si es lead o no inicialmente, si no, si hacer primero el calculo. Si cambiar cierta forma de como funciona la api en general, entre otras. Poder tener mejor contexto y sabiduria acerca del caso. 
