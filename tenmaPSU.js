import { SerialPort } from 'serialport';
import { setTimeout } from 'timers/promises';

/** This class implements the Tenma PSU serial protocol as described in https://twiki.cern.ch/twiki/bin/view/CLIC/TenmaPWRRemoteControlSyntax or https://github.com/kxtells/tenma-serial/tree/master 
 * It should support 1 and 2 channels PSU. For it work properly you need to call maintain method periodically
*/
export class TenmaPSU 
{
    /**
     * Instantiante the class and set default values
     * @param {*} port Serial port to connect to
     */
    constructor(port) 
    {
        /**
         * Class variable containing the status of the PSU. It is updated by the respective get/read methods.
         * The best way to populate it is to call maintain method periodically
         * Sidenote: the actual output current and voltage output must be read by two commands that are executed in series (with cca 50-100ms difference). This means that they do not represent the exact same point in time, so for example power calculations (current*voltage) can be inaccurate
         */
        this.state = 
        {
            currentSetting:{1:null,2:null},
            voltageSetting:{1:null,2:null},
            currentOutput:{1:null,2:null},
            voltageOutput:{1:null,2:null},
            outputEnabled:null,
            tracking:null,
            channel1Mode:null,
            channel2Mode:null,
            beepEnabled:null,
            lockEnabled:null
        };
        this.channel2present=false; // You need to manually set this to true for PSUs with 2 channels
        this.identity = null;
        this.port = new SerialPort( {path: port, baudRate: 9600,  autoOpen: false });
    }


    /**
     * Sends command to the PSU and waits for reply. 
     * The PSU serial protocol does not handle any response delimiting, so best bet is to wait for the data to timeout. Other option would be to count the received bytes as they seem to be fixed for each protocol function.
     * @param {*} command Command to send
     * @param {*} expectBinary Set true to receive binary data (default false). There is a command that returns binary byte, everything else retuns ASCII values
     * @param {*} timeout Timeout to wait for data (default 50)
     * @returns the received data (either as string or binary buffer)
     */
    async sendCommandAndWaitForResponse(command, expectBinary = false, timeout = 50) 
    {
        return new Promise((resolve, reject) => 
        {
            let responseData = expectBinary ? Buffer.alloc(0) : '';
            const handleData = (data) =>  { if (expectBinary) { responseData = Buffer.concat([responseData, data]); } else {responseData += data.toString(); }; };
            this.port.write(command, (err) => 
            {
                if (err) {reject(err);return; }
                this.port.on('data', handleData);
                setTimeout(timeout).then(() => 
                {
                    this.port.removeListener('data', handleData);
                    resolve(responseData);
                });
            });
        });
    }
    /** Open the port */
    async open() 
    {
        await new Promise((resolve, reject) => 
        {
            this.port.open((err) => 
            {
                if (err) {reject(err); return; }
                resolve();
            });
        });
    }

    /** Close the port */
    async close() 
    {
        await new Promise((resolve, reject) => 
        {
            this.port.close((err) => 
            {
                if (err) {reject(err); return; }
                resolve();
            });
        });
    }

    /** Method to set the output current
     * @param {*} channel Channel to set, must be 1 or 2
     * @param {*} current Current to set, must be in format 0.123
     */
    async setCurrent(channel, current) 
    {
        await this.sendCommandAndWaitForResponse(`ISET${channel}:${current}`);
    }

    /**  Method to get the output set current
    * @param {*} channel Channel to get, must be 1 or 2
    * @returns set current in format 0.123
    */
    async getCurrentSetting(channel) 
    {
        const response = await this.sendCommandAndWaitForResponse(`ISET${channel}?`);
        this.state.currentSetting[channel] = response;
        return response; 
    }

     /** Method to set the output volatge
     * @param {*} channel Channel to set, must be 1 or 2
     * @param {*} voltage Current to set, must be in format 01.23
     */
    async setVoltage(channel, voltage) 
    {
        await this.sendCommandAndWaitForResponse(`VSET${channel}:${voltage}`);
    }

    /**  Method to get the output set voltage
    * @param {*} channel Channel to get, must be 1 or 2
    * @returns set voltage in format 01.23
    */
    async getVoltageSetting(channel) 
    {
        const response = await this.sendCommandAndWaitForResponse(`VSET${channel}?`);
        this.state.voltageSetting[channel] = response;
        return response; 
    }

    /**
     * Turns on or off the beep
     * @param {*} state 0=OFF, 1=ON. 
     */
    async setBeep(state) 
    {
        await this.sendCommandAndWaitForResponse(`BEEP${state}`);
    }

    /**
     * Turn the output ON or OFF. 
     * @param {*} state 0=OFF, 1=ON
     */
    async setOutput(state) 
    {
        await this.sendCommandAndWaitForResponse(`OUT${state}`);
    }

    /** 
     * Get the power supply status.
     * The status is one byte containing bit encoded status. See processStatusByte for more information
     */
    async getStatus() 
    {
        const response = await this.sendCommandAndWaitForResponse('STATUS?',true);
        if (response.length === 1) {this.processStatusByte(response[0]);}
        return response;
    }

    /** Read the actual output voltage
    * @param {*} channel Channel to get, must be 1 or 2
    * @returns actual output voltage in format 01.23
    */
    async readOutputVoltage(channel) 
    {
        const response = await this.sendCommandAndWaitForResponse(`VOUT${channel}?`);
        this.state.voltageOutput[channel] = response;        
        return response; 
    }

    /** Read the actual output current
    * @param {*} channel Channel to get, must be 1 or 2
    * @returns actual output current in format 0.123
    */
    async readOutputCurrent(channel) 
    {
        const response = await this.sendCommandAndWaitForResponse(`IOUT${channel}?`);
        this.state.currentOutput[channel] = response;
        return response; 
    }

    /**
     * Get the PSU identification. This is helpful for detecting if the connection to the PSU has been established successfully
     * @returns PSU identification in form TENMA 72-2535 V5.8 SN:03248514
     */
    async getIdentification() 
    {
        const response = await this.sendCommandAndWaitForResponse('*IDN?',false,50);
        this.identity=response;
        return response; 
    }

     /** Recall memory setting
      * @param {*} memoryNumber Memory number to recall
      */
     async recallSetting(memoryNumber) 
     {
        await this.sendCommandAndWaitForResponse(`RCL${memoryNumber}`);
    }

    /** Store memory setting
    * @param {*} memoryNumber Memory number to store
    */
    async saveSetting(memoryNumber) 
    {
        await this.sendCommandAndWaitForResponse(`SAV${memoryNumber}`);
    }

    /** Turn on or off Over Current Protection
     * There is no way how to get the OCP status from the PSU.
     * @param {*} state 0=OFF, 1=ON
    */
    async setOCP(state) 
    {
        await this.sendCommandAndWaitForResponse(`OCP${state}`);
    }

    /** Turn on or off Over Voltage Protection
     * There is no way how to get the OVP status from the PSU.
     *  @param {*} 0=OFF, 1=ON
     * */
    async setOVP(state) 
    {
        await this.sendCommandAndWaitForResponse(`OVP${state}`);
    }

    /**
     * Parse the status byte and set the state accordingly
     * @param {*} sb status byte received from PSU
     */
    processStatusByte(sb)
    {
        const ch1mode = (sb & 0x01); // bit 0 - mode of channel 1 (1=C.V. 0=C.C.)
        const ch2mode = (sb & 0x02); // bit 1 - mode of channel 2 (1=C.V. 0=C.C.)
        const tracking = (sb & 0x0C) >> 2; // bit 2+3 - tracking mode
        const beep = (sb & 0x10); // bit 4 - beep mode  0=Off, 1=On
        const lock = (sb & 0x20); // bit 5 - panel lock enabled 0=Lock, 1=Unlock 
        const out = (sb & 0x40); //bit 6 - output enabled 0=Off, 1=On 

        if (tracking==0) this.state.tracking="Independent";
        else if (tracking==1) this.state.tracking="Tracking Series";
        else if (tracking==3) this.state.tracking="Tracking Parallel";        
        else this.state.tracking="Unknown";

        this.state.channel1Mode=(ch1mode)?'C.V.':'C.C.';
        this.state.channel2Mode=(ch2mode)?'C.V.':'C.C.';
        this.state.beepEnabled=beep>0;
        this.state.lockEnabled=lock>0;
        this.state.outputEnabled=out>0;
    }

    /**
     * Get the PSU status. 
     * This method should be called periodically but can not be called multiple times at once. 
     * Also it calls should be interleaved with other commands to prevent serial port conflict.
     * This method takes a significant time to complete - 50ms for each command by default so 250ms in case of 1 channel PSU.
     * However it seems that rushing the PSU is against the protocol and smaller timeouts will create data corruption on the serial port
     */
    async maintain()
    {
        await this.getCurrentSetting(1);
        await this.getVoltageSetting(1);
        await this.readOutputCurrent(1);
        await this.readOutputVoltage(1);
        if (this.channel2present) //simple measure to not get status of second channel if it is not present - it is to save time
        {
            await this.getCurrentSetting(2);
            await this.getVoltageSetting(2);
            await this.readOutputCurrent(2);
            await this.readOutputVoltage(2);        
        }
        await this.getStatus();        
    }


    


}

/** @example
 * //Simple example:
 * const psu=new TenmaPSU('com18');
 * await psu.open();
 * await psu.getIdentification();
 * if ((psu.identity != null) && (psu.identity.startsWith('TENMA')))
 * {
 *     await psu.getStatus();
 *     await psu.getVoltageSetting(1);
 *     console.log(psu.state);
 * }
 * await psu.close();
*/

/** @example 
 * //More complex example:
 * const psu=new TenmaPSU('com18');
 * await psu.open();
 * await psu.getIdentification();
 * setInterval(async function ()
 *     {
 *         await psu.maintain();
 *         console.log(psu.state);
 *     },1000);
 * await psu.setVoltage(1,'05.00'); 
 * await psu.setOutput(1);
 * setTimeout(async function () {await psu.setOutput(1);},1000);
 * 
*/


