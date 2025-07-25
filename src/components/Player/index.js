import React from 'react';
import { connect } from 'react-redux';
import InputRange from 'react-input-range';
import axios from 'axios';
import faPlay from '@fortawesome/fontawesome-free-solid/faPlay';
import faChevronLeft from '@fortawesome/fontawesome-free-solid/faChevronLeft';
import faChevronRight from '@fortawesome/fontawesome-free-solid/faChevronRight';
import faPause from '@fortawesome/fontawesome-free-solid/faPause';
import faWrench from '@fortawesome/fontawesome-free-solid/faWrench';
import { classes, createUserFile, extension } from 'common/util';
import { TracerApi,AIApi } from 'apis';
import { actions } from 'reducers';
import { BaseComponent, Button, ProgressBar } from 'components';
import styles from './Player.module.scss';
import { callAI } from 'common/util';

const decoder=new TextDecoder('utf-8')

class Player extends BaseComponent {
  constructor(props) {
    super(props);

    this.state = {
      speed: 2,
      playing: false,
      building: false,
    };

    this.tracerApiSource = null;

    this.reset();
  }

  componentDidMount() {
    const { editingFile, shouldBuild } = this.props.current;
    if (shouldBuild) this.build(editingFile);
  }

  componentWillReceiveProps(nextProps) {
    const { editingFile, shouldBuild } = nextProps.current;
    if (editingFile !== this.props.current.editingFile) {
      if (shouldBuild) this.build(editingFile);
    }
  }

  reset(commands = []) {
    const chunks = [{
      commands: [],
      lineNumber: undefined,
    }];
    while (commands.length) {
      const command = commands.shift();
      const { key, method, args } = command;
      if (key === null && method === 'delay') {
        const [lineNumber] = args;
        chunks[chunks.length - 1].lineNumber = lineNumber;
        chunks.push({
          commands: [],
          lineNumber: undefined,
        });
      } else {
        chunks[chunks.length - 1].commands.push(command);
      }
    }
    this.props.setChunks(chunks);
    this.props.setCursor(0);
    this.pause();
    this.props.setLineIndicator(undefined);
  }

  build(file) {
    this.reset();
    if (!file) return;

    if (this.tracerApiSource) this.tracerApiSource.cancel();
    this.tracerApiSource = axios.CancelToken.source();
    this.setState({ building: true });

    const ext = extension(file.name);
    if (ext in TracerApi) {
      TracerApi[ext]({ code: file.content }, undefined, this.tracerApiSource.token)
        .then(commands => {
          this.tracerApiSource = null;
          this.setState({ building: false });
          this.reset(commands);
          this.next();
        })
        .catch(error => {
          if (axios.isCancel(error)) return;
          this.tracerApiSource = null;
          this.setState({ building: false });
          this.handleError(error);
        });
    } else {
      this.setState({ building: false });
      this.handleError(new Error('Language Not Supported'));
    }
  }

  callAI(file){
    let props=this.props
    //console.log(this.props)
    console.log(`Chat start`)
    const tosend={
      name:file.name,
      content:file.content
    }
    let chatNew_req=AIApi.chatNew(tosend)
    //console.log(chatNew_req)
    
    chatNew_req.then(

      chatNew_response=>{
        //console.log(chatNew_response)
        const {chatId}=chatNew_response
        console.log(`Chat ${chatId} started`)

        

        function syncFn(){
          console.log(`try sync`)
          let chatSync_req=AIApi.chatSync({chatId})

          chatSync_req.then(chatSync_res=>{

            console.log(chatSync_res)

            let finished=false

            for(let sync_Action of chatSync_res){

              const action_type=sync_Action.type

              switch (action_type){
                case("FileCreate"):{
                  const {fileName,select}=sync_Action
                  const newFile=createUserFile(fileName,"")
                  props.addFile(newFile)
                  if (select){
                    props.setEditingFile(newFile)
                  }
                  break;
                }

                case("FileAppend"):{
                  const {fileName,appends}=sync_Action
                  props.appendFile(fileName,appends)
                  break;
                }
                
                case("ChatGenEnd"):{
                  
                  
                  //interval.close()
                  finished=true
                  break;
                }

                case("Log"):{
                  console.log(sync_Action.msg)
                  break;
                }

                case("Error"):{
                  console.log(`Chat ${chatId} Error`)
                  console.log(sync_Action.msg)
                  finished=true
                  break;
                }
              }
            }

            if (finished){
              console.log(`Chat ${chatId} ended`)
            }
            else{
              setTimeout(syncFn,500)
            }
            
          }).catch((err)=>{
            console.log(`sync error for chat ${chatId}: ${err}`)
          })

        }
        setTimeout(syncFn,200)
      }
    ).catch((err)=>{
      console.log(`sync error for creating chat: ${err}`)
    })
  }

  test(){
    this.callAI(createUserFile("README.md","请向我演示冒泡排序"))
  }

  isValidCursor(cursor) {
    const { chunks } = this.props.player;
    return 1 <= cursor && cursor <= chunks.length;
  }

  prev() {
    this.pause();
    const cursor = this.props.player.cursor - 1;
    if (!this.isValidCursor(cursor)) return false;
    this.props.setCursor(cursor);
    return true;
  }

  resume(wrap = false) {
    this.pause();
    if (this.next() || (wrap && this.props.setCursor(1))) {
      const interval = 4000 / Math.pow(Math.E, this.state.speed);
      this.timer = window.setTimeout(() => this.resume(), interval);
      this.setState({ playing: true });
    }
  }

  pause() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
      this.setState({ playing: false });
    }
  }

  next() {
    this.pause();
    const cursor = this.props.player.cursor + 1;
    if (!this.isValidCursor(cursor)) return false;
    this.props.setCursor(cursor);
    return true;
  }

  handleChangeSpeed(speed) {
    this.setState({ speed });
  }

  handleChangeProgress(progress) {
    const { chunks } = this.props.player;
    const cursor = Math.max(1, Math.min(chunks.length, Math.round(progress * chunks.length)));
    this.pause();
    this.props.setCursor(cursor);
  }

  render() {
    const { className } = this.props;
    const { editingFile } = this.props.current;
    const { chunks, cursor } = this.props.player;
    const { speed, playing, building } = this.state;

    return (
      <div className={classes(styles.player, className)}>
        <Button icon={faWrench} primary disabled={building} inProgress={building}
                onClick={() => this.build(editingFile)}>
          {building ? 'Building' : 'Build'}
        </Button>
        {
          playing ? (
            <Button icon={faPause} primary active onClick={() => this.pause()}>Pause</Button>
          ) : (
            <Button icon={faPlay} primary onClick={() => this.resume(true)}>Play</Button>
          )
        }
        <Button icon={faWrench} onClick={()=>this.callAI(editingFile)}> 
          {"Call AI"}
        </Button>
        <Button icon={faWrench} onClick={()=>this.test()}> 
          {"Test"}
        </Button>
        <Button icon={faChevronLeft} primary disabled={!this.isValidCursor(cursor - 1)} onClick={() => this.prev()}/>
        <ProgressBar className={styles.progress_bar} current={cursor} total={chunks.length}
                     onChangeProgress={progress => this.handleChangeProgress(progress)}/>
        <Button icon={faChevronRight} reverse primary disabled={!this.isValidCursor(cursor + 1)}
                onClick={() => this.next()}/>
        <div className={styles.speed}>
          Speed
          <InputRange
            classNames={{
              inputRange: styles.range,
              labelContainer: styles.range_label_container,
              slider: styles.range_slider,
              track: styles.range_track,
            }} minValue={0} maxValue={4} step={.5} value={speed}
            onChange={speed => this.handleChangeSpeed(speed)}/>
        </div>
      </div>
    );
  }
}

export default connect(({ current, player }) => ({ current, player }), actions)(
  Player,
);
